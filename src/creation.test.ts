/* eslint-disable @typescript-eslint/naming-convention -- Companion option and variable identifiers */
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { OAuth2Client } from 'google-auth-library';
import type { youtube_v3 } from '@googleapis/youtube';
import { YoutubeConnector, CreationError } from './youtube.js';
import { Core } from './core.js';
import { ActionId, listActions } from './actions.js';
import { declareVars, exportVars } from './vars.js';
import { loadCreatedIds } from './config.js';
import { BroadcastLifecycle } from './lifecycle.js';
import { StreamHealth, Visibility, type CreateBroadcastOptions } from './types.js';
import type { CreatedBroadcast } from './cache.js';
import { makeMockModule } from './__tests__/mock/module.js';
import { makeMockYT } from './__tests__/mock/youtube-api.js';
import { MockContext } from './__tests__/mock-context.js';

const options: CreateBroadcastOptions = {
	title: 'Neuer Livestream',
	description: '',
	visibility: 'unlisted',
	resolution: 'variable',
	frameRate: 'variable',
	autoStart: false,
};
const broadcast: youtube_v3.Schema$LiveBroadcast = {
	id: 'new-broadcast',
	snippet: { title: options.title, description: '', scheduledStartTime: '2026-10-10T22:00:00Z' },
	status: { lifeCycleStatus: 'ready', privacyStatus: 'unlisted' },
	contentDetails: { boundStreamId: 'new-stream', monitorStream: { enableMonitorStream: true } },
};
const stream: youtube_v3.Schema$LiveStream = {
	id: 'new-stream',
	cdn: { ingestionInfo: { streamName: 'SECRET-KEY', ingestionAddress: 'rtmp://example.test/live' } },
};
const created: CreatedBroadcast = {
	broadcast: {
		Id: 'new-broadcast',
		Name: options.title,
		Description: '',
		Status: BroadcastLifecycle.Ready,
		BoundStreamId: 'new-stream',
		MonitorStreamEnabled: true,
		ScheduledStartTime: '2026-10-10T22:00:00Z',
		ActualStartTime: null,
		LiveChatId: '',
		LiveConcurrentViewers: 'n/a',
		Visibility: Visibility.Unlisted,
	},
	stream: { Id: 'new-stream', Health: StreamHealth.NoData },
	streamKey: 'SECRET-KEY',
	rtmpUrl: 'rtmp://example.test/live',
};

describe('YouTube creation transaction', () => {
	const insertBroadcast = vi.fn();
	const insertStream = vi.fn();
	const bind = vi.fn();
	const deleteBroadcast = vi.fn();
	const deleteStream = vi.fn();
	const listBroadcasts = vi.fn();
	const listStreams = vi.fn();
	const transition = vi.fn();
	let connector: YoutubeConnector;

	beforeEach(() => {
		vi.resetAllMocks();
		connector = new YoutubeConnector(new OAuth2Client(), 10);
		connector.ApiClient = {
			liveBroadcasts: { insert: insertBroadcast, bind, delete: deleteBroadcast, list: listBroadcasts, transition },
			liveStreams: { insert: insertStream, delete: deleteStream, list: listStreams },
		} as unknown as youtube_v3.Youtube;
		insertBroadcast.mockResolvedValue({ data: { id: broadcast.id } });
		insertStream.mockResolvedValue({ data: stream });
		bind.mockResolvedValue({ data: broadcast });
		listBroadcasts.mockResolvedValue({ data: { items: [broadcast] } });
		listStreams.mockResolvedValue({ data: { items: [stream] } });
	});

	test('creates a fresh stream, binds it, returns data and never transitions or auto-starts', async () => {
		const before = Date.now();
		await expect(connector.createBroadcastAndStream(options)).resolves.toEqual(created);
		expect(insertBroadcast).toHaveBeenCalledExactlyOnceWith(
			expect.objectContaining({
				requestBody: {
					snippet: { title: options.title, description: '', scheduledStartTime: expect.any(String) },
					status: { privacyStatus: 'unlisted' },
					contentDetails: {
						enableAutoStart: false,
						enableAutoStop: false,
						monitorStream: { enableMonitorStream: true, broadcastStreamDelayMs: 0 },
					},
				},
			}),
			{ retry: false }
		);
		const args = insertBroadcast.mock.calls[0][0] as youtube_v3.Params$Resource$Livebroadcasts$Insert;
		expect(Date.parse(args.requestBody!.snippet!.scheduledStartTime!)).toBeGreaterThan(before);
		expect(insertStream).toHaveBeenCalledExactlyOnceWith(
			expect.objectContaining({
				requestBody: {
					snippet: { title: options.title },
					cdn: { ingestionType: 'rtmp', resolution: 'variable', frameRate: 'variable' },
					contentDetails: { isReusable: false },
				},
			}),
			{ retry: false }
		);
		expect(bind).toHaveBeenCalledExactlyOnceWith(
			{ id: 'new-broadcast', streamId: 'new-stream', part: ['snippet', 'status', 'contentDetails'] },
			{ retry: false }
		);
		expect(insertBroadcast.mock.invocationCallOrder[0]).toBeLessThan(insertStream.mock.invocationCallOrder[0]);
		expect(insertStream.mock.invocationCallOrder[0]).toBeLessThan(bind.mock.invocationCallOrder[0]);
		expect(transition).not.toHaveBeenCalled();
		expect(deleteBroadcast).not.toHaveBeenCalled();
	});

	test.each([true, false, undefined])('sets auto-start only when explicitly enabled (%s)', async (autoStart) => {
		await connector.createBroadcastAndStream({ ...options, autoStart });
		const args = insertBroadcast.mock.calls[0][0] as youtube_v3.Params$Resource$Livebroadcasts$Insert;
		expect(args.requestBody?.contentDetails?.enableAutoStart).toBe(autoStart === true);
		expect(args.requestBody?.contentDetails?.enableAutoStop).toBe(false);
		expect(transition).not.toHaveBeenCalled();
	});

	test.each([
		{ title: '' },
		{ title: 'x'.repeat(101) },
		{ description: 'x'.repeat(5001) },
		{ title: '<bad>' },
		{ visibility: 'invalid' },
		{ resolution: '4K' },
		{ frameRate: '25fps' },
		{ resolution: '1080p' },
		{ frameRate: '30fps' },
	])('rejects invalid options before creating resources: %j', async (invalid) => {
		await expect(connector.createBroadcastAndStream({ ...options, ...invalid })).rejects.toThrow(
			'Invalid creation options'
		);
		expect(insertBroadcast).not.toHaveBeenCalled();
	});

	test.each([401, 403, 429, 500])('sanitizes API errors (HTTP %i) without retrying inserts', async (status) => {
		insertBroadcast.mockRejectedValue({ message: 'SECRET-KEY OAuth-token', response: { status, data: stream } });
		await expect(connector.createBroadcastAndStream(options)).rejects.toThrow('failed during broadcast creation');
		await expect(connector.createBroadcastAndStream(options)).rejects.not.toThrow('SECRET-KEY');
		expect(insertStream).not.toHaveBeenCalled();
		expect(deleteBroadcast).not.toHaveBeenCalled();
	});

	test('stream failure cleans up only the newly created broadcast', async () => {
		insertStream.mockRejectedValue(new Error('secret'));
		await expect(connector.createBroadcastAndStream(options)).rejects.toThrow('stream creation');
		expect(deleteBroadcast).toHaveBeenCalledExactlyOnceWith({ id: 'new-broadcast' }, { retry: false });
		expect(deleteStream).not.toHaveBeenCalled();
		expect(bind).not.toHaveBeenCalled();
	});

	test('bind failure cleans up broadcast before stream', async () => {
		bind.mockRejectedValue(new Error('secret'));
		await expect(connector.createBroadcastAndStream(options)).rejects.toThrow('binding');
		expect(deleteBroadcast).toHaveBeenCalledOnce();
		expect(deleteStream).toHaveBeenCalledExactlyOnceWith({ id: 'new-stream' }, { retry: false });
		expect(deleteBroadcast.mock.invocationCallOrder[0]).toBeLessThan(deleteStream.mock.invocationCallOrder[0]);
	});

	test('retains a possibly bound stream if broadcast cleanup fails and reports IDs only', async () => {
		bind.mockRejectedValue(new Error('SECRET-KEY'));
		deleteBroadcast.mockRejectedValue(new Error('OAuth-token'));
		await expect(connector.createBroadcastAndStream(options)).rejects.toThrow(
			'Broadcast new-broadcast may remain. Stream new-stream was retained.'
		);
		expect(deleteStream).not.toHaveBeenCalled();
	});

	test('reports failed stream cleanup', async () => {
		bind.mockRejectedValue(new Error('failure'));
		deleteStream.mockRejectedValue(new Error('SECRET-KEY'));
		await expect(connector.createBroadcastAndStream(options)).rejects.toThrow('Stream new-stream may remain.');
	});

	test('rejects incomplete ingest data and cleans up both new resources', async () => {
		insertStream.mockResolvedValue({ data: { id: 'new-stream' } });
		await expect(connector.createBroadcastAndStream(options)).rejects.toThrow('stream creation');
		expect(bind).not.toHaveBeenCalled();
		expect(deleteStream).toHaveBeenCalledOnce();
	});

	test('rejects an unconfirmed binding', async () => {
		bind.mockResolvedValue({ data: { ...broadcast, contentDetails: {} } });
		await expect(connector.createBroadcastAndStream(options)).rejects.toThrow('binding');
		expect(deleteStream).toHaveBeenCalledOnce();
	});

	test('restores the secret through authenticated API reads by exact IDs', async () => {
		await expect(
			connector.restoreCreatedBroadcast({ broadcastId: 'new-broadcast', streamId: 'new-stream' })
		).resolves.toEqual(created);
		expect(listStreams).toHaveBeenCalledWith({ id: ['new-stream'], part: ['cdn', 'status'] });
		expect(insertStream).not.toHaveBeenCalled();
	});

	test('handles deleted resources without returning partial data or secrets', async () => {
		listStreams.mockResolvedValue({ data: { items: [] } });
		await expect(
			connector.restoreCreatedBroadcast({ broadcastId: 'new-broadcast', streamId: 'new-stream' })
		).rejects.toThrow('could not be restored');
	});

	test('an empty channel can initialize without invalid stream/status list requests', async () => {
		await expect(connector.listBoundStreams({})).resolves.toEqual({});
		await expect(connector.refreshBroadcastStatus({})).resolves.toEqual({});
		expect(listStreams).not.toHaveBeenCalled();
		expect(listBroadcasts).not.toHaveBeenCalled();
	});

	test('refresh includes created resources beyond the discovery limit in batches of 50', async () => {
		connector.MaxBroadcasts = 1;
		const broadcasts = Object.fromEntries(
			Array.from({ length: 51 }, (_, i) => [`b${i}`, { ...created.broadcast, Id: `b${i}`, BoundStreamId: `s${i}` }])
		);
		listBroadcasts.mockImplementation(async ({ id }: { id: string[] }) => ({
			data: { items: id.map((value) => ({ ...broadcast, id: value })) },
		}));
		listStreams.mockImplementation(async ({ id }: { id: string[] }) => ({
			data: { items: id.map((value) => ({ id: value })) },
		}));
		const refreshed = await connector.refreshBroadcastStatus(broadcasts);
		expect(Object.keys(refreshed)).toHaveLength(51);
		expect(refreshed.b50.LiveConcurrentViewers).toBe('n/a');
		const streams = await connector.listBoundStreams(broadcasts);
		expect(Object.keys(streams)).toHaveLength(51);
		expect(streams.s50.Health).toBe(StreamHealth.NoData);
		expect(listBroadcasts).toHaveBeenCalledTimes(2);
		expect(listStreams).toHaveBeenCalledTimes(2);
	});
});

describe('Companion integration', () => {
	const module = vi.mocked(makeMockModule());
	const api = vi.mocked(makeMockYT({ Broadcasts: {}, Streams: {}, UnfinishedBroadcasts: [] }));
	let core: Core;
	beforeEach(() => {
		vi.clearAllMocks();
		module.loadCreatedIds.mockReturnValue(undefined);
		api.listBroadcasts.mockImplementation(async () => ({}));
		api.listBoundStreams.mockImplementation(async () => ({}));
		api.createBroadcastAndStream.mockResolvedValue(created);
		api.restoreCreatedBroadcast.mockResolvedValue(created);
		core = new Core(module, api, 60_000);
	});
	afterEach(() => core.destroy());

	test('publishes six variables immediately and persists IDs without the key', async () => {
		await core.createBroadcastAndStream(options);
		expect(
			Object.fromEntries(
				exportVars(core.Cache, 0)
					.filter((v) => v.name.startsWith('last_'))
					.map((v) => [v.name, v.value])
			)
		).toEqual({
			last_broadcast_id: 'new-broadcast',
			last_broadcast_url: 'https://www.youtube.com/watch?v=new-broadcast',
			last_stream_id: 'new-stream',
			last_stream_key: 'SECRET-KEY',
			last_rtmp_url: 'rtmp://example.test/live',
			last_stream_title: options.title,
		});
		expect(module.saveCreatedIds).toHaveBeenCalledExactlyOnceWith({
			broadcastId: 'new-broadcast',
			streamId: 'new-stream',
		});
		expect(module.reloadAll).toHaveBeenCalledWith(core.Cache);
		expect(core.Cache.Broadcasts['new-broadcast']).toEqual(created.broadcast);
		expect(core.Cache.UnfinishedBroadcasts).toContainEqual(created.broadcast);
		expect(declareVars(core.Cache, 0).filter((v) => v.variableId.startsWith('last_'))).toHaveLength(6);
		expect(api.transitionBroadcast).not.toHaveBeenCalled();
	});

	test('keeps the previous success and persisted IDs on failure, without logging secrets', async () => {
		await core.createBroadcastAndStream(options);
		api.createBroadcastAndStream.mockRejectedValueOnce(new Error('SECRET-KEY OAuth-token'));
		await core.createBroadcastAndStream(options);
		expect(core.Cache.LastCreated).toEqual(created);
		expect(module.saveCreatedIds).toHaveBeenCalledTimes(1);
		expect(JSON.stringify(module.log.mock.calls)).not.toContain('SECRET-KEY');
	});

	test('ignores concurrent presses, waits on close, and allows no new creation while closing', async () => {
		const pending = Promise.withResolvers<CreatedBroadcast>();
		api.createBroadcastAndStream.mockReturnValueOnce(pending.promise);
		const first = core.createBroadcastAndStream(options);
		await core.createBroadcastAndStream(options);
		expect(api.createBroadcastAndStream).toHaveBeenCalledTimes(1);
		expect(module.saveCreatedIds).not.toHaveBeenCalled();
		const close = core.close();
		pending.resolve(created);
		await Promise.all([first, close]);
		await core.createBroadcastAndStream(options);
		expect(api.createBroadcastAndStream).toHaveBeenCalledTimes(1);
	});

	test('releases the lock after failure and allows another deliberate press', async () => {
		api.createBroadcastAndStream.mockRejectedValueOnce(new CreationError('quota'));
		await core.createBroadcastAndStream(options);
		await core.createBroadcastAndStream(options);
		expect(api.createBroadcastAndStream).toHaveBeenCalledTimes(2);
		expect(core.Cache.LastCreated).toEqual(created);
	});

	test('restores last-created data after restart even outside the recent broadcast list', async () => {
		module.loadCreatedIds.mockReturnValue({ broadcastId: 'new-broadcast', streamId: 'new-stream' });
		await core.init();
		expect(core.Cache.LastCreated).toEqual(created);
		expect(core.Cache.Broadcasts['new-broadcast']).toEqual(created.broadcast);
		expect(api.createBroadcastAndStream).not.toHaveBeenCalled();
	});

	test('a restore failure does not break the rest of the connection', async () => {
		module.loadCreatedIds.mockReturnValue({ broadcastId: 'deleted', streamId: 'deleted' });
		api.restoreCreatedBroadcast.mockRejectedValueOnce(new Error('SECRET-KEY'));
		await core.init();
		expect(module.reloadAll).toHaveBeenCalled();
		expect(core.Cache.LastCreated).toBeUndefined();
		expect(JSON.stringify(module.log.mock.calls)).not.toContain('SECRET-KEY');
	});

	test('an older periodic response cannot discard the newly created broadcast', async () => {
		const pending = Promise.withResolvers<Record<string, never>>();
		api.refreshBroadcastStatus.mockReturnValueOnce(pending.promise);
		const refresh = core.refresher();
		await core.createBroadcastAndStream(options);
		pending.resolve({});
		await refresh;
		expect(core.Cache.Broadcasts['new-broadcast']).toEqual(created.broadcast);
	});

	test('creation fields use host variable substitution and pass expanded multiline text unchanged', async () => {
		const actions = listActions({ broadcasts: {}, unfinishedCount: 0, core });
		const action = actions[ActionId.CreateBroadcastStream];
		expect(action.options).toContainEqual(
			expect.objectContaining({ id: 'title', useVariables: true, default: 'Neuer Livestream' })
		);
		expect(action.options).toContainEqual(expect.objectContaining({ id: 'description', useVariables: true }));
		// Module API 1.13 passes host-expanded options to the callback.
		await action.callback(
			{
				id: 'a',
				actionId: ActionId.CreateBroadcastStream,
				controlId: 'b',
				surfaceId: undefined,
				options: { ...options, title: 'Expanded title', description: 'Line 1\nLine 2' },
			},
			new MockContext()
		);
		expect(api.createBroadcastAndStream).toHaveBeenCalledWith({
			...options,
			title: 'Expanded title',
			description: 'Line 1\nLine 2',
		});
	});

	test.each([true, false, undefined, 'true', 'false'])(
		'passes only a boolean opt-in from the action (%s)',
		async (autoStart) => {
			const action = listActions({ broadcasts: {}, unfinishedCount: 0, core })[ActionId.CreateBroadcastStream];
			expect(action.options).toContainEqual(
				expect.objectContaining({ id: 'autoStart', type: 'checkbox', default: false })
			);
			await action.callback(
				{
					id: 'a',
					actionId: ActionId.CreateBroadcastStream,
					controlId: 'b',
					surfaceId: undefined,
					options: { ...options, autoStart },
				},
				new MockContext()
			);
			expect(api.createBroadcastAndStream).toHaveBeenCalledWith({ ...options, autoStart: autoStart === true });
		}
	);

	test('action stays pending until binding completes and publishes the new key before completing', async () => {
		const pending = Promise.withResolvers<CreatedBroadcast>();
		api.createBroadcastAndStream.mockReturnValueOnce(pending.promise);
		const action = listActions({ broadcasts: {}, unfinishedCount: 0, core })[ActionId.CreateBroadcastStream];
		let completed = false;
		const running = Promise.resolve(
			action.callback(
				{
					id: 'a',
					actionId: ActionId.CreateBroadcastStream,
					controlId: 'b',
					surfaceId: undefined,
					options: { ...options },
				},
				new MockContext()
			)
		).then(() => {
			completed = true;
			expect(module.reloadAll).toHaveBeenCalledWith(core.Cache);
			expect(exportVars(core.Cache, 0)).toContainEqual({ name: 'last_stream_key', value: 'SECRET-KEY' });
		});
		await Promise.resolve();
		expect(completed).toBe(false);
		expect(module.reloadAll).not.toHaveBeenCalled();
		pending.resolve(created);
		await running;
		expect(completed).toBe(true);
	});

	test.each([
		[ActionId.InitBroadcast, 'startBroadcastTest'],
		[ActionId.StartBroadcast, 'makeBroadcastLive'],
		[ActionId.StopBroadcast, 'finishBroadcast'],
		[ActionId.ToggleBroadcast, 'toggleBroadcast'],
	] as const)('existing action %s accepts the expanded last_broadcast_id', async (actionId, method) => {
		await core.createBroadcastAndStream(options);
		const callback = vi.spyOn(core, method).mockResolvedValue();
		const action = listActions({ broadcasts: core.Cache.Broadcasts, unfinishedCount: 3, core })[actionId];
		await action.callback(
			{
				id: 'a',
				actionId,
				controlId: 'b',
				surfaceId: undefined,
				options: { broadcast_id_is_text: true, broadcast_id_text: 'new-broadcast' },
			},
			new MockContext()
		);
		expect(callback).toHaveBeenCalledExactlyOnceWith('new-broadcast');
	});

	test('reload waits for creation and preserves the last successful result', async () => {
		const pending = Promise.withResolvers<CreatedBroadcast>();
		api.createBroadcastAndStream.mockReturnValueOnce(pending.promise);
		const first = core.createBroadcastAndStream(options);
		const reload = core.reloadEverything();
		module.loadCreatedIds.mockReturnValue({ broadcastId: 'new-broadcast', streamId: 'new-stream' });
		pending.resolve(created);
		await Promise.all([first, reload]);
		expect(core.Cache.LastCreated).toEqual(created);
	});
});

test('persisted identifiers are validated and extraneous secret fields are discarded', () => {
	expect(loadCreatedIds({ last_created: { broadcastId: 'b', streamId: 's', streamKey: 'SECRET-KEY' } })).toEqual({
		broadcastId: 'b',
		streamId: 's',
	});
	expect(loadCreatedIds({ last_created: { broadcastId: '', streamId: 's' } })).toBeUndefined();
	expect(loadCreatedIds({ last_created: null })).toBeUndefined();
});
