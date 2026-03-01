const { BlobServiceClient } = require('@azure/storage-blob');
const { v4: uuidv4 } = require('uuid');

const blobServiceClient = BlobServiceClient.fromConnectionString(
  process.env.AZURE_STORAGE_CONNECTION_STRING
);

// Upload any file buffer to a given container, returns the public URL
async function uploadToBlob(fileBuffer, originalFilename, containerName) {
  const containerClient = blobServiceClient.getContainerClient(containerName);
  await containerClient.createIfNotExists({ access: 'blob' });
  const extension  = originalFilename.split('.').pop();
  const blobName   = `${uuidv4()}.${extension}`;   // unique name — no collisions
  const blobClient = containerClient.getBlockBlobClient(blobName);

  await blobClient.upload(fileBuffer, fileBuffer.length, {
    blobHTTPHeaders: { blobContentType: getMimeType(extension) }
  });

  return blobClient.url;  // public URL saved to DB
}

// Delete a blob by its full URL — safe to call even if blob no longer exists
async function deleteBlob(blobUrl, containerName) {
  const blobName   = blobUrl.split('/').pop();
  const blobClient = blobServiceClient
    .getContainerClient(containerName)
    .getBlockBlobClient(blobName);

  await blobClient.deleteIfExists();
  // deleteIfExists never throws — safe even if file was already removed
}

// Fetch a blob back as a Buffer
async function fetchBlobAsBuffer(blobUrl, containerName) {
  const blobName       = blobUrl.split('/').pop();
  const blobClient     = blobServiceClient
    .getContainerClient(containerName)
    .getBlockBlobClient(blobName);
  const downloadResult = await blobClient.download();
  const chunks         = [];
  for await (const chunk of downloadResult.readableStreamBody) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

function getMimeType(extension) {
  const map = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', pdf: 'application/pdf' };
  return map[extension.toLowerCase()] || 'application/octet-stream';
}

module.exports = { uploadToBlob, deleteBlob, fetchBlobAsBuffer };
