import type { OAuth2Client } from 'google-auth-library';
import { youtube, type youtube_v3 } from '@googleapis/youtube';
import type { Broadcast, BroadcastMap, CreatedBroadcast, StreamMap } from './cache.js';
import { type BroadcastLifecycle } from './lifecycle.js';
import {
	type BroadcastID,
	type CreateBroadcastOptions,
	type CreatedResourceIds,
	StreamHealth,
	StreamResolutions,
	StreamFrameRates,
	Visibility,
} from './types.js';

/** Never propagate Google error objects: they can contain request credentials or stream keys. */
export class CreationError extends Error {}

function safeApiFailure(error: unknown): string {
	const response = (error as { response?: { status?: number } } | null)?.response;
	switch (response?.status) {
		case 401:
			return 'Authorization expired or revoked; reconnect the existing YouTube connection.';
		case 403:
			return 'YouTube denied the request; check quota, channel live permission and OAuth consent.';
		case 429:
			return 'YouTube rate limit reached; wait before trying again.';
		default:
			return 'YouTube request failed; check connectivity, authorization and API quota.';
	}
}

function createdBroadcast(
	broadcast: youtube_v3.Schema$LiveBroadcast,
	stream: youtube_v3.Schema$LiveStream
): CreatedBroadcast {
	const info = stream.cdn?.ingestionInfo;
	if (
		!broadcast.id ||
		!stream.id ||
		!info?.streamName ||
		!info.ingestionAddress ||
		broadcast.contentDetails?.boundStreamId !== stream.id ||
		!broadcast.snippet?.title ||
		!broadcast.snippet.scheduledStartTime ||
		!broadcast.status?.lifeCycleStatus
	) {
		throw new CreationError('YouTube returned incomplete broadcast/stream data.');
	}
	return {
		broadcast: {
			Id: broadcast.id,
			Name: broadcast.snippet.title,
			Status: broadcast.status.lifeCycleStatus as BroadcastLifecycle,
			BoundStreamId: stream.id,
			MonitorStreamEnabled: broadcast.contentDetails.monitorStream?.enableMonitorStream ?? true,
			ScheduledStartTime: broadcast.snippet.scheduledStartTime,
			ActualStartTime: broadcast.snippet.actualStartTime ?? null,
			LiveChatId: broadcast.snippet.liveChatId ?? '',
			LiveConcurrentViewers: broadcast.statistics?.concurrentViewers ?? 'n/a',
			Description: broadcast.snippet.description ?? '',
			Visibility: broadcastVisibility(broadcast),
		},
		stream: {
			Id: stream.id,
			Health: (stream.status?.healthStatus?.status as StreamHealth | undefined) ?? StreamHealth.NoData,
		},
		streamKey: info.streamName,
		rtmpUrl: info.ingestionAddress,
	};
}

/**
 * Broadcast transition types
 */
export enum Transition {
	/** Transition from ready state to testing state */
	ToTesting = 'testing',
	/** Transition from testing state (or ready state, if monitor is disabled) to live state */
	ToLive = 'live',
	/** Transition from live state to complete state */
	ToComplete = 'complete',
}

function broadcastVisibility(broadcast: youtube_v3.Schema$LiveBroadcast): Visibility {
	const privacyStatus = broadcast.status!.privacyStatus;
	return privacyStatus ? (privacyStatus as Visibility) : Visibility.Private;
}

export interface YoutubeAPI {
	createBroadcastAndStream(options: CreateBroadcastOptions): Promise<CreatedBroadcast>;
	restoreCreatedBroadcast(ids: CreatedResourceIds): Promise<CreatedBroadcast>;
	/**
	 * Fetch known broadcasts (limited by max count)
	 * @returns Map of known broadcasts
	 */
	listBroadcasts(): Promise<BroadcastMap>;

	/**
	 * Refresh lifecycle status of one broadcast
	 * @param broadcast Old broadcast structure
	 * @returns Updated broadcast structure
	 */
	refreshBroadcastStatus1(broadcast: Broadcast): Promise<Broadcast>;

	/**
	 * Refresh lifecycle status of all broadcasts
	 * @param current Map of known broadcasts
	 * @returns Updated map of broadcasts
	 */
	refreshBroadcastStatus(current: BroadcastMap): Promise<BroadcastMap>;

	/**
	 * Fetch streams bound to known broadcasts
	 * @param broadcasts Map of known broadcasts
	 * @returns Map of known streams
	 */
	listBoundStreams(broadcasts: BroadcastMap): Promise<StreamMap>;

	/**
	 * Transition one broadcast to a different state
	 * @param id Broadcast ID to transition
	 * @param to Target lifecycle phase/state
	 */
	transitionBroadcast(id: BroadcastID, to: Transition): Promise<void>;

	/**
	 * Send a message to broadcast live chat
	 * @param id Live chat ID
	 * @param message Content of the message (max. 200 characters)
	 */
	sendMessageToLiveChat(id: string, message: string): Promise<void>;

	/**
	 * Insert a cue point in the specified broadcast
	 * @param id Broadcast ID
	 * @param duration Duration of the cue point (seconds)
	 */
	insertCuePoint(id: BroadcastID, duration?: number): Promise<void>;

	/**
	 * Set description for the given broadcast
	 * @param id Broadcast ID
	 * @param sst Scheduled start time of the broadcast
	 * @param title Title of the broadcast
	 * @param desc Content (to set) of the description
	 */
	setDescription(id: BroadcastID, sst: string, title: string, desc: string): Promise<void>;

	/**
	 * Set title for the given broadcast
	 * @param id Broadcast ID
	 * @param sst Scheduled start time of the broadcast
	 * @param title Title of the broadcast
	 */
	setTitle(id: BroadcastID, sst: string, title: string): Promise<void>;

	/**
	 * Set the visibility of the broadcast
	 * @param id Broadcast ID
	 * @param visibility Visibility of the broadcast
	 */
	setVisibility(id: BroadcastID, visibility: Visibility): Promise<void>;
}

/**
 * YouTube API wrapper
 */
export class YoutubeConnector implements YoutubeAPI {
	async createBroadcastAndStream(options: CreateBroadcastOptions): Promise<CreatedBroadcast> {
		const { title, description, visibility, resolution, frameRate } = options;
		if (
			!title.trim() ||
			title.length > 100 ||
			description.length > 5000 ||
			/[<>]/.test(title + description) ||
			!Object.values(Visibility).some((v) => (v as string) === visibility) ||
			!StreamResolutions.includes(resolution) ||
			!StreamFrameRates.includes(frameRate) ||
			(resolution === 'variable') !== (frameRate === 'variable')
		) {
			throw new CreationError(
				'Invalid creation options: title 1–100 characters, description at most 5000, no < or >, valid visibility/resolution/framerate; Variable must be selected for both resolution and framerate.'
			);
		}
		let broadcastId: string | undefined;
		let streamId: string | undefined;
		let stage = 'broadcast creation';
		// Inserts must not be retried after an ambiguous network failure.
		const requestOptions = { retry: false };
		try {
			const broadcast = await this.ApiClient.liveBroadcasts.insert(
				{
					part: ['snippet', 'status', 'contentDetails'],
					requestBody: {
						snippet: { title, description, scheduledStartTime: new Date(Date.now() + 5 * 60_000).toISOString() },
						status: { privacyStatus: visibility },
						contentDetails: {
							enableAutoStart: options.autoStart === true,
							enableAutoStop: false,
							monitorStream: { enableMonitorStream: true, broadcastStreamDelayMs: 0 },
						},
					},
				},
				requestOptions
			);
			broadcastId = broadcast.data.id ?? undefined;
			if (!broadcastId) throw new CreationError('Missing broadcast ID.');
			stage = 'stream creation';
			const stream = await this.ApiClient.liveStreams.insert(
				{
					part: ['snippet', 'cdn', 'contentDetails', 'status'],
					requestBody: {
						snippet: { title },
						cdn: { ingestionType: 'rtmp', resolution, frameRate },
						contentDetails: { isReusable: false },
					},
				},
				requestOptions
			);
			streamId = stream.data.id ?? undefined;
			if (!streamId || !stream.data.cdn?.ingestionInfo?.streamName || !stream.data.cdn.ingestionInfo.ingestionAddress) {
				throw new CreationError('Missing stream ID or ingest data.');
			}
			stage = 'binding';
			const bound = await this.ApiClient.liveBroadcasts.bind(
				{
					id: broadcastId,
					streamId,
					part: ['snippet', 'status', 'contentDetails'],
				},
				requestOptions
			);
			return createdBroadcast(bound.data, stream.data);
		} catch (error) {
			// Delete only resources created by this invocation. Delete the broadcast first;
			// if that fails, keep the possibly bound stream for manual inspection.
			let cleanup = '';
			let broadcastDeleted = !broadcastId;
			if (broadcastId) {
				try {
					await this.ApiClient.liveBroadcasts.delete({ id: broadcastId }, requestOptions);
					broadcastDeleted = true;
				} catch (_error) {
					cleanup = ` Broadcast ${broadcastId} may remain.`;
				}
			}
			if (streamId && broadcastDeleted) {
				try {
					await this.ApiClient.liveStreams.delete({ id: streamId }, requestOptions);
				} catch (_error) {
					cleanup += ` Stream ${streamId} may remain.`;
				}
			} else if (streamId) {
				cleanup += ` Stream ${streamId} was retained.`;
			}
			throw new CreationError(
				`Create Broadcast + Stream failed during ${stage}. ${safeApiFailure(error)}${cleanup} Check YouTube Studio before retrying: a lost response can leave an unknown resource.`
			);
		}
	}

	async restoreCreatedBroadcast(ids: CreatedResourceIds): Promise<CreatedBroadcast> {
		try {
			const broadcast = await this.ApiClient.liveBroadcasts.list({
				id: [ids.broadcastId],
				part: ['snippet', 'status', 'contentDetails'],
			});
			const stream = await this.ApiClient.liveStreams.list({ id: [ids.streamId], part: ['cdn', 'status'] });
			const b = broadcast.data.items?.[0];
			const s = stream.data.items?.[0];
			if (!b || !s || b.id !== ids.broadcastId || s.id !== ids.streamId)
				throw new CreationError('Resources unavailable.');
			return createdBroadcast(b, s);
		} catch (_error) {
			throw new CreationError(
				'Last created broadcast could not be restored. Check authorization and that both resources still exist and are bound, then reload everything.'
			);
		}
	}
	/** Google API client */
	ApiClient: youtube_v3.Youtube;

	/** Max number of broadcasts to fetch */
	MaxBroadcasts: number;

	/**
	 * Create new YouTube API wrapper
	 * @param auth Authorized Google OAuth2 client
	 * @param maxBroadcasts Limit on how many broadcasts to fetch
	 */
	constructor(auth: OAuth2Client, maxBroadcasts: number) {
		this.ApiClient = youtube({
			version: 'v3',
			auth,
		});
		this.MaxBroadcasts = maxBroadcasts;
	}

	/**
	 * @inheritdoc
	 */
	async listBroadcasts(): Promise<BroadcastMap> {
		const response = await this.ApiClient.liveBroadcasts.list({
			part: ['snippet', 'status', 'contentDetails', 'statistics'],
			broadcastType: 'all',
			mine: true,
			maxResults: this.MaxBroadcasts,
		});

		const mapping: BroadcastMap = {};

		response.data.items?.forEach((item) => {
			const id = item.id!;
			const status = item.status!.lifeCycleStatus! as BroadcastLifecycle;
			const monitor = item.contentDetails!.monitorStream!.enableMonitorStream ?? true;
			const concurrentViewers = item.statistics?.concurrentViewers ?? 'n/a';
			const description = item.snippet!.description ?? '';
			const visibility = broadcastVisibility(item);

			mapping[id] = {
				Id: id,
				Name: item.snippet!.title!,
				Status: status,
				BoundStreamId: item.contentDetails!.boundStreamId || null,
				MonitorStreamEnabled: monitor,
				ScheduledStartTime: item.snippet!.scheduledStartTime!,
				ActualStartTime: item.snippet!.actualStartTime || null,
				LiveChatId: item.snippet!.liveChatId!,
				LiveConcurrentViewers: concurrentViewers,
				Description: description,
				Visibility: visibility,
			};
		});

		return mapping;
	}

	/**
	 * @inheritdoc
	 */
	async refreshBroadcastStatus1(broadcast: Broadcast): Promise<Broadcast> {
		const response = await this.ApiClient.liveBroadcasts.list({
			part: ['snippet', 'status', 'statistics'],
			id: [broadcast.Id],
			maxResults: 1,
		});

		if (!response.data.items || response.data.items.length == 0) {
			throw new Error('no such broadcast: ' + broadcast.Id);
		}

		const item = response.data.items[0];
		const status = item.status!.lifeCycleStatus! as BroadcastLifecycle;
		const concurrentViewers = item.statistics?.concurrentViewers ?? 'n/a';
		const actualStartTime = broadcast.ActualStartTime
			? broadcast.ActualStartTime
			: item.snippet?.actualStartTime
				? item.snippet.actualStartTime
				: null;
		const description = item.snippet!.description ?? '';
		const visibility = broadcastVisibility(item);

		return {
			Id: broadcast.Id,
			Name: broadcast.Name,
			Status: status,
			BoundStreamId: broadcast.BoundStreamId,
			MonitorStreamEnabled: broadcast.MonitorStreamEnabled,
			ScheduledStartTime: broadcast.ScheduledStartTime,
			ActualStartTime: actualStartTime,
			LiveChatId: broadcast.LiveChatId,
			LiveConcurrentViewers: concurrentViewers,
			Description: description,
			Visibility: visibility,
		};
	}

	/**
	 * @inheritdoc
	 */
	async refreshBroadcastStatus(current: BroadcastMap): Promise<BroadcastMap> {
		const ids = Object.keys(current);
		const mapping: BroadcastMap = {};
		// Locally created broadcasts can exceed the configured discovery limit.
		for (let offset = 0; offset < ids.length; offset += 50) {
			const response = await this.ApiClient.liveBroadcasts.list({
				part: ['snippet', 'status', 'statistics'],
				id: ids.slice(offset, offset + 50),
				maxResults: 50,
			});

			response.data.items?.forEach((item) => {
				const id = item.id!;
				const status = item.status!.lifeCycleStatus! as BroadcastLifecycle;
				const concurrentViewers = item.statistics?.concurrentViewers ?? 'n/a';
				const actualStartTime = current[id].ActualStartTime
					? current[id].ActualStartTime
					: item.snippet?.actualStartTime
						? item.snippet.actualStartTime
						: null;
				const description = item.snippet!.description ?? '';
				const visibility = broadcastVisibility(item);

				mapping[id] = {
					Id: id,
					Name: current[id].Name,
					Status: status,
					BoundStreamId: current[id].BoundStreamId,
					MonitorStreamEnabled: current[id].MonitorStreamEnabled,
					ScheduledStartTime: current[id].ScheduledStartTime,
					ActualStartTime: actualStartTime,
					LiveChatId: current[id].LiveChatId,
					LiveConcurrentViewers: concurrentViewers,
					Description: description,
					Visibility: visibility,
				};
			});
		}
		return mapping;
	}

	/**
	 * @inheritdoc
	 */
	async listBoundStreams(broadcasts: BroadcastMap): Promise<StreamMap> {
		const streamIds = Array.from(new Set(Object.values(broadcasts).map((broadcast) => broadcast.BoundStreamId))).filter(
			(id): id is string => id !== null
		);
		const mapping: StreamMap = {};
		for (let offset = 0; offset < streamIds.length; offset += 50) {
			const response = await this.ApiClient.liveStreams.list({
				part: ['status'],
				id: streamIds.slice(offset, offset + 50),
				maxResults: 50,
			});

			response.data.items?.forEach((item) => {
				const id = item.id!;
				const health = (item.status?.healthStatus?.status as StreamHealth | undefined) ?? StreamHealth.NoData;

				mapping[id] = {
					Id: id,
					Health: health,
				};
			});
		}

		return mapping;
	}

	/**
	 * @inheritdoc
	 */
	async transitionBroadcast(id: BroadcastID, to: Transition): Promise<void> {
		await this.ApiClient.liveBroadcasts.transition({
			part: ['id'],
			id,
			broadcastStatus: to,
		});
	}

	/**
	 * @inheritdoc
	 */
	async sendMessageToLiveChat(id: string, message: string): Promise<void> {
		await this.ApiClient.liveChatMessages.insert({
			part: ['snippet'],
			requestBody: {
				snippet: {
					liveChatId: id,
					type: 'textMessageEvent',
					textMessageDetails: {
						messageText: message,
					},
				},
			},
		});
	}

	/**
	 * @inheritdoc
	 */
	async insertCuePoint(id: string, duration?: number): Promise<void> {
		const requestBody: youtube_v3.Schema$Cuepoint = {
			cueType: 'cueTypeAd',
		};

		if (duration) requestBody['durationSecs'] = duration;
		await this.ApiClient.liveBroadcasts.insertCuepoint({
			id,
			requestBody,
		});
	}

	/**
	 * @inheritdoc
	 */
	async setDescription(id: BroadcastID, sst: string, title: string, desc: string): Promise<void> {
		const description = desc.replace(/\\n/g, String.fromCharCode(10));

		await this.ApiClient.liveBroadcasts.update({
			part: ['snippet'],
			requestBody: {
				id,
				snippet: {
					scheduledStartTime: sst,
					title,
					description,
				},
			},
		});
	}

	/**
	 * @inheritdoc
	 */
	async setTitle(id: string, sst: string, title: string): Promise<void> {
		await this.ApiClient.liveBroadcasts.update({
			part: ['snippet'],
			requestBody: {
				id,
				snippet: {
					scheduledStartTime: sst,
					title,
				},
			},
		});
	}

	/**
	 * @inheritdoc
	 */
	async setVisibility(id: BroadcastID, visibility: Visibility): Promise<void> {
		await this.ApiClient.liveBroadcasts.update({
			part: ['status'],
			requestBody: {
				id,
				status: {
					privacyStatus: visibility,
				},
			},
		});
	}
}
