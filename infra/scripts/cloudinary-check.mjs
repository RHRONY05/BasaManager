// V3 check: Cloudinary authenticated uploads + expiring signed download URLs, for an image and a raw PDF.
//   Needs the `cloudinary` package (v2) next to the script or on NODE_PATH, e.g. in a scratch folder:
//     mkdir scratch && cd scratch && npm i cloudinary@2.11.0 && cp ../infra/scripts/cloudinary-check.mjs . && node cloudinary-check.mjs
//   (V9 adds `cloudinary` to apps/api; then this can run from the repo.)
//   Env: CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET. Prints names and HTTP statuses only.
// Only touches the folder basamanager/staging/_v3check/ and deletes what it created.
import { randomUUID } from 'node:crypto';
import { v2 as cloudinary } from 'cloudinary';

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

const folder = 'basamanager/staging/_v3check';
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);
const pdf = Buffer.from(
  '%PDF-1.1\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n' +
    '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n',
);

function upload(buffer, publicId, resourceType) {
  return new Promise((resolve, reject) => {
    cloudinary.uploader
      .upload_stream(
        { public_id: publicId, type: 'authenticated', resource_type: resourceType, overwrite: true },
        (err, res) => (err ? reject(err) : resolve(res)),
      )
      .end(buffer);
  });
}

const results = [];
async function check(label, buffer, resourceType, format) {
  const publicId = `${folder}/${randomUUID()}`;
  const up = await upload(buffer, publicId, resourceType);
  const expiresAt = Math.floor(Date.now() / 1000) + 20;
  const url = cloudinary.utils.private_download_url(up.public_id, format, {
    type: 'authenticated',
    resource_type: resourceType,
    expires_at: expiresAt,
    attachment: true,
  });
  const direct = await fetch(
    `https://res.cloudinary.com/${process.env.CLOUDINARY_CLOUD_NAME}/${resourceType}/authenticated/${up.public_id}${resourceType === 'image' ? '.' + format : ''}`,
  );
  const before = await fetch(url);
  await new Promise((r) => setTimeout(r, 25_000));
  const after = await fetch(url);
  const ok = before.status === 200 && after.status !== 200 && direct.status !== 200;
  results.push(ok);
  console.log(
    `${label}: upload type=${up.type} | unsigned delivery ${direct.status} (must not be 200) | signed URL before expiry ${before.status} (must be 200) | after expiry ${after.status} (must not be 200) => ${ok ? 'PASS' : 'FAIL'}`,
  );
  await cloudinary.uploader.destroy(up.public_id, {
    type: 'authenticated',
    resource_type: resourceType,
    invalidate: true,
  });
}

await Promise.all([check('image', png, 'image', 'png'), check('raw pdf', pdf, 'raw', 'pdf')]);
console.log(results.every(Boolean) ? 'CLOUDINARY CHECK PASSED' : 'CLOUDINARY CHECK FAILED');
process.exit(results.every(Boolean) ? 0 : 1);
