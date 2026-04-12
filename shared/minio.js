'use strict';

const { Client } = require('minio');
const path       = require('path');
const crypto     = require('crypto');

let minioClient;

function getClient() {
  if (!minioClient) {
    const accessKey = process.env.MINIO_USER;
    const secretKey = process.env.MINIO_PASSWORD;
    if (!accessKey || !secretKey) {
      throw new Error('MINIO_USER and MINIO_PASSWORD must be set as environment variables');
    }
    minioClient = new Client({
      endPoint:  process.env.MINIO_ENDPOINT || 'minio',
      port:      parseInt(process.env.MINIO_PORT || '9000'),
      useSSL:    process.env.MINIO_USE_SSL === 'true',
      accessKey,
      secretKey,
    });
  }
  return minioClient;
}

const BUCKETS = {
  patients: process.env.MINIO_BUCKET_PATIENTS || 'patient-files',
  grooming: process.env.MINIO_BUCKET_GROOMING || 'grooming-photos',
  tele:     process.env.MINIO_BUCKET_TELE     || 'tele-docs',
};

/**
 * Ensure bucket exists (create if missing).
 */
async function ensureBucket(bucketName) {
  const client = getClient();
  const exists = await client.bucketExists(bucketName);
  if (!exists) {
    await client.makeBucket(bucketName, 'us-east-1');
    // No public policy — all access via presigned URLs only
  }
}

/**
 * Upload a file buffer to MinIO.
 * @param {Buffer} buffer
 * @param {string} originalName
 * @param {string} bucket
 * @param {string} folder   e.g. 'patients/123'
 * @returns {Promise<string>} Public URL
 */
async function uploadFile(buffer, originalName, bucket = BUCKETS.patients, folder = '') {
  await ensureBucket(bucket);

  const ext      = path.extname(originalName).toLowerCase();
  const name     = `${folder ? folder + '/' : ''}${Date.now()}-${crypto.randomBytes(4).toString('hex')}${ext}`;
  const mimeType = getMimeType(ext);

  await getClient().putObject(bucket, name, buffer, buffer.length, {
    'Content-Type': mimeType,
  });

  const endpoint = process.env.MINIO_ENDPOINT || 'minio';
  const port     = process.env.MINIO_PORT || '9000';
  return `http://${endpoint}:${port}/${bucket}/${name}`;
}

/**
 * Generate a presigned URL for temporary access.
 */
async function getPresignedUrl(bucket, objectName, expirySeconds = 3600) {
  return getClient().presignedGetObject(bucket, objectName, expirySeconds);
}

/**
 * Delete a file from MinIO.
 */
async function deleteFile(bucket, objectName) {
  return getClient().removeObject(bucket, objectName);
}

function getMimeType(ext) {
  const types = {
    '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
    '.webp': 'image/webp', '.gif': 'image/gif',
    '.pdf': 'application/pdf',
    '.dcm': 'application/dicom',
  };
  return types[ext] || 'application/octet-stream';
}

module.exports = { getClient, uploadFile, getPresignedUrl, deleteFile, BUCKETS };
