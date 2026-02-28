const BASE = import.meta.env.VITE_API_URL;

const json = async (r) => {
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  return r.json();
};

// Screen 1
export const getProperties = () =>
  fetch(`${BASE}/api/properties`).then(json);

export const getViolationsTimeline = () =>
  fetch(`${BASE}/api/dashboard/violations-timeline`).then(json);

// Screen 2
export const getProperty = (id) =>
  fetch(`${BASE}/api/properties/${id}`).then(json);

export const resolveViolation = (id) =>
  fetch(`${BASE}/api/violations/${id}/resolve`, { method: 'PATCH' }).then(json);

export const getViolation = (id) =>
  fetch(`${BASE}/api/violations/${id}`).then(json);

export const updateViolation = (id, data) =>
  fetch(`${BASE}/api/violations/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  }).then(json);

// Screen 3 — uses FormData (NOT JSON) because we're uploading a file
export const analyzeViolation = (file, propertyId, hint = '') => {
  const form = new FormData();
  form.append('file', file);
  form.append('property_id', propertyId);
  form.append('hint', hint);
  return fetch(`${BASE}/api/violations/analyze`, {
    method: 'POST',
    body: form   // no Content-Type header — browser sets it automatically with boundary
  }).then(json);
};

export const submitViolation = (data) =>
  fetch(`${BASE}/api/violations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  }).then(json);

export const createProperty = (data) =>
  fetch(`${BASE}/api/properties`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  }).then(json);

export const deleteProperty = (id) =>
  fetch(`${BASE}/api/properties/${id}`, { method: 'DELETE' }).then(json);

export const uploadRulesPdf = (propertyId, file) => {
  const form = new FormData();
  form.append('file', file);
  return fetch(`${BASE}/api/properties/${propertyId}/rules-pdf`, {
    method: 'POST',
    body: form
  }).then(json);
};
