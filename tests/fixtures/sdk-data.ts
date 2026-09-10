import type { AssistantMessage, Session, UserMessage } from '@opencode-ai/sdk/v2'

export const user = (id = 'user-1', created = 1, sessionID = 'parent'): UserMessage => ({ id, sessionID, role: 'user', time: { created }, agent: 'build', model: { providerID: 'fixture', modelID: 'never-called' } })
export const assistant = (id = 'assistant-1', parentID = 'user-1', created = 2): AssistantMessage => ({ id, sessionID: 'parent', parentID, role: 'assistant', time: { created }, modelID: 'never-called', providerID: 'fixture', mode: 'build', agent: 'build', path: { cwd: '/fixture', root: '/fixture' }, cost: 0, tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } } })
export const session = (id: string, parentID?: string): Session => ({ id, parentID, slug: id, projectID: 'project', directory: '/fixture', title: id, version: '1.18.30', time: { created: 1, updated: 1 } })
