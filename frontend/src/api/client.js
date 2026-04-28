const BASE = import.meta.env.VITE_API_BASE_URL || ''

async function request(method, path, body) {
  const opts = {
    method,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : {},
  }
  if (body !== undefined) opts.body = JSON.stringify(body)

  const res = await fetch(`${BASE}${path}`, opts)
  if (res.status === 204) return null
  const data = await res.json()
  if (!res.ok) {
    const msg = data?.detail || data?.message || `HTTP ${res.status}`
    throw new Error(msg)
  }
  return data
}

// Tags
export const getTags = () => request('GET', '/api/tags')
export const createTag = ({ name, color }) => request('POST', '/api/tags', { name, color })
export const updateTag = (id, { name, color }) => request('PUT', `/api/tags/${id}`, { name, color })
export const deleteTag = (id) => request('DELETE', `/api/tags/${id}`)

// Folders
export const getFolders = () => request('GET', '/api/folders')
export const createFolder = ({ name, color }) => request('POST', '/api/folders', { name, color })
export const deleteFolder = (id) => request('DELETE', `/api/folders/${id}`)
export const reorderFolders = (folders) => request('PATCH', '/api/folders/reorder', { folders })
export const updateFolder = (id, payload) => request('PUT', `/api/folders/${id}`, payload)
export const getFolderDocuments = (id) => request('GET', `/api/folders/${id}/documents`)
// Campaigns
export const getCampaigns = () => request('GET', '/api/campaigns')
export const createCampaign = ({ name, color }) => request('POST', '/api/campaigns', { name, color })
export const updateCampaign = (id, payload) => request('PUT', `/api/campaigns/${id}`, payload)
export const deleteCampaign = (id) => request('DELETE', `/api/campaigns/${id}`)
export const reorderCampaigns = (campaigns) => request('PATCH', '/api/campaigns/reorder', { campaigns })
export const getCampaignDocuments = (id) => request('GET', `/api/campaigns/${id}/documents`)

// Documents
export const getDocuments = (params = {}) => {
  const qs = new URLSearchParams()
  Object.entries(params).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== '') qs.set(k, v) })
  const q = qs.toString()
  return request('GET', `/api/knowledge/documents${q ? `?${q}` : ''}`)
}
export const getDocument = (id) => request('GET', `/api/knowledge/documents/${id}`)
export const createDocument = ({ title, content, folder_id, campaign_id, tag_ids }) =>
  request('POST', '/api/knowledge/documents', { title, content, folder_id, campaign_id, tag_ids })
export const updateDocument = (id, payload) => request('PUT', `/api/knowledge/documents/${id}`, payload)
export const deleteDocument = (id) => request('DELETE', `/api/knowledge/documents/${id}`)
export const searchDocuments = (params = {}) => {
  const qs = new URLSearchParams()
  Object.entries(params).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== '') qs.set(k, v) })
  return request('GET', `/api/knowledge/documents/search?${qs.toString()}`)
}

// Chat
export const sendChat = ({ message, folder_id, tag_id }) =>
  request('POST', '/api/chat', { message, folder_id, tag_id })

// Knowledge history
export const getKnowledgeHistory = (params = {}) => {
  const qs = new URLSearchParams()
  Object.entries(params).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== '') qs.set(k, v) })
  const q = qs.toString()
  return request('GET', `/api/knowledge/history${q ? `?${q}` : ''}`)
}
export const getKnowledgeHistoryRecent = (params = {}) => {
  const qs = new URLSearchParams()
  Object.entries(params).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== '') qs.set(k, v) })
  const q = qs.toString()
  return request('GET', `/api/knowledge/history/recent${q ? `?${q}` : ''}`)
}
export const getKnowledgeHistoryTop = (params = {}) => {
  const qs = new URLSearchParams()
  Object.entries(params).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== '') qs.set(k, v) })
  const q = qs.toString()
  return request('GET', `/api/knowledge/history/top${q ? `?${q}` : ''}`)
}

// Queries
export const getQueries = (params = {}) => {
  const qs = new URLSearchParams()
  Object.entries(params).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== '') qs.set(k, v) })
  const q = qs.toString()
  return request('GET', `/api/queries${q ? `?${q}` : ''}`)
}
export const getQueryDetail = (id) => request('GET', `/api/queries/${id}`)
export const rerunQuery = (id) => request('POST', `/api/queries/${id}/rerun`)

// Document dependencies (pre-delete summary)
export const getDocumentDependencies = (id) => request('GET', `/api/knowledge/documents/${id}/dependencies`)

// Observability
export const getObsPostgres = (params = {}) => {
  const qs = new URLSearchParams()
  Object.entries(params).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== '') qs.set(k, v) })
  const q = qs.toString()
  return request('GET', `/api/observability/postgres${q ? `?${q}` : ''}`)
}
export const getObsQdrant = () => request('GET', '/api/observability/qdrant')
export const getObsDuckDB = (params = {}) => {
  const qs = new URLSearchParams()
  Object.entries(params).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== '') qs.set(k, v) })
  const q = qs.toString()
  return request('GET', `/api/observability/duckdb${q ? `?${q}` : ''}`)
}
export const getObsTags = () => request('GET', '/api/observability/tags')
