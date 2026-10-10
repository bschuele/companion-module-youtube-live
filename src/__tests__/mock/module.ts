import { vi } from 'vitest';
import type { ModuleBase } from '../../core.js';

export function makeMockModule(): ModuleBase {
	return {
		loadCreatedIds: vi.fn<ModuleBase['loadCreatedIds']>(),
		saveCreatedIds: vi.fn<ModuleBase['saveCreatedIds']>(),
		reloadAll: vi.fn<ModuleBase['reloadAll']>(),
		reloadStates: vi.fn<ModuleBase['reloadStates']>(),
		reloadBroadcast: vi.fn<ModuleBase['reloadBroadcast']>(),
		log: vi.fn<ModuleBase['log']>(),
	};
}
