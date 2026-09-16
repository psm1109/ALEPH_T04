import { createApp } from '../app.mjs';

const handle = createApp();

export default async function handler(req, res) {
  const headers = new Headers();
  for (const [name, value] of Object.entries(req.headers)) {
    if (value !== undefined) headers.set(name, Array.isArray(value) ? value.join(', ') : value);
  }
  const request = new Request(new URL(req.url, 'https://dollar-note.internal'), { method: req.method, headers });
  const response = await handle(request);
  res.statusCode = response.status;
  response.headers.forEach((value, name) => res.setHeader(name, value));
  res.end(await response.text());
}
