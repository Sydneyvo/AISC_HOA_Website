const BASE = import.meta.env.VITE_API_URL;

// Injected by App.jsx after Clerk initializes
let _getToken = async () => null;
export function setTokenGetter(fn) { _getToken = fn; }

// Build auth headers, merging any extra headers passed in
async function authHeaders(extra = {}) {
  const token = await _getToken();
  if (token) extra['Authorization'] = `Bearer ${token}`;
  return extra;
}

const json = async (r) => {
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  return r.json();
};

// Screen 1
export const getProperties = async () =>
  fetch(`${BASE}/api/properties`, {
    headers: await authHeaders(),
  }).then(json);

export const getViolationsTimeline = async () =>
  fetch(`${BASE}/api/dashboard/violations-timeline`, {
    headers: await authHeaders(),
  }).then(json);

// Screen 2
export const getProperty = async (id) =>
  fetch(`${BASE}/api/properties/${id}`, {
    headers: await authHeaders(),
  }).then(json);

export const resolveViolation = async (id) =>
  fetch(`${BASE}/api/violations/${id}/resolve`, {
    method: 'PATCH',
    headers: await authHeaders(),
  }).then(json);

export const getViolation = async (id) =>
  fetch(`${BASE}/api/violations/${id}`, {
    headers: await authHeaders(),
  }).then(json);

export const updateViolation = async (id, data) =>
  fetch(`${BASE}/api/violations/${id}`, {
    method: 'PATCH',
    headers: await authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data),
  }).then(json);

// Screen 3 — uses FormData (NOT JSON) because we're uploading a file
export const analyzeViolation = async (file, propertyId, hint = '') => {
  const form = new FormData();
  form.append('file', file);
  form.append('property_id', propertyId);
  form.append('hint', hint);
  return fetch(`${BASE}/api/violations/analyze`, {
    method: 'POST',
    headers: await authHeaders(), // no Content-Type — browser sets it with boundary
    body: form,
  }).then(json);
};

export const submitViolation = async (data) =>
  fetch(`${BASE}/api/violations`, {
    method: 'POST',
    headers: await authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data),
  }).then(json);

export const createProperty = async (data) =>
  fetch(`${BASE}/api/properties`, {
    method: 'POST',
    headers: await authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data),
  }).then(json);

export const deleteProperty = async (id) =>
  fetch(`${BASE}/api/properties/${id}`, {
    method: 'DELETE',
    headers: await authHeaders(),
  }).then(json);

export const uploadRulesPdf = async (propertyId, file) => {
  const form = new FormData();
  form.append('file', file);
  return fetch(`${BASE}/api/properties/${propertyId}/rules-pdf`, {
    method: 'POST',
    headers: await authHeaders(), // no Content-Type — browser sets it with boundary
    body: form,
  }).then(json);
};

// Finance
export const getFinance = async () =>
  fetch(`${BASE}/api/finance`, {
    headers: await authHeaders(),
  }).then(json);

export const getPropertyBills = async (propertyId) =>
  fetch(`${BASE}/api/finance/property/${propertyId}`, {
    headers: await authHeaders(),
  }).then(json);

export const payBill = async (billId) =>
  fetch(`${BASE}/api/finance/${billId}/pay`, {
    method: 'PATCH',
    headers: await authHeaders(),
  }).then(json);
