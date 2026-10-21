import { google } from 'googleapis';

const driveAuth = new google.auth.GoogleAuth({
  credentials: {
    client_email: process.env.DRIVE_CLIENT_EMAIL,
    private_key: (process.env.DRIVE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
  },
  scopes: ['https://www.googleapis.com/auth/drive.readonly'],
});

const drive = google.drive({ version: 'v3', auth: driveAuth });

export async function streamDriveFile(fileId, res) {
  let meta;
  try {
    meta = await drive.files.get({
      fileId,
      fields: 'name, mimeType, size',
      supportsAllDrives: true,
    });
  } catch (err) {
    console.error('Drive metadata error:', err.message);
    if (!res.headersSent) {
      return res.status(404).json({ error: 'File not found or inaccessible' });
    }
    return;
  }

  const filename = encodeURIComponent(meta.data.name || 'document.pdf');
  res.setHeader('Content-Type', meta.data.mimeType || 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  if (meta.data.size) res.setHeader('Content-Length', meta.data.size);
  res.setHeader('Cache-Control', 'private, no-store');

  try {
    const file = await drive.files.get(
      { fileId, alt: 'media', supportsAllDrives: true },
      { responseType: 'stream' }
    );

    file.data.on('error', (streamErr) => {
      console.error('Drive stream error:', streamErr.message);
      if (!res.headersSent) res.status(500).end();
      else res.end();
    });

    file.data.pipe(res);
  } catch (err) {
    console.error('Drive download error:', err.message);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Could not download file' });
    } else {
      res.end();
    }
  }
}
