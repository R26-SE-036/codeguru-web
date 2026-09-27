import { describe, expect, it } from 'vitest';
import { GET } from '@/app/download/sample-java/route';
import { SAMPLE_FOLDER, SAMPLE_JAVA_FILES } from '@/lib/sample-java';
import { buildZip, crc32 } from '@/lib/zip';

/** Reads back what buildZip wrote, following the central directory like an unzip tool does. */
function readZip(zip: Uint8Array): { path: string; text: string }[] {
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  const end = zip.length - 22;
  expect(view.getUint32(end, true)).toBe(0x06054b50);

  const count = view.getUint16(end + 10, true);
  let at = view.getUint32(end + 16, true);
  const decoder = new TextDecoder();
  const files = [];

  for (let i = 0; i < count; i++) {
    expect(view.getUint32(at, true)).toBe(0x02014b50);
    const crc = view.getUint32(at + 16, true);
    const size = view.getUint32(at + 24, true);
    const nameLength = view.getUint16(at + 28, true);
    const localAt = view.getUint32(at + 42, true);
    const path = decoder.decode(zip.subarray(at + 46, at + 46 + nameLength));

    expect(view.getUint32(localAt, true)).toBe(0x04034b50);
    const dataAt = localAt + 30 + view.getUint16(localAt + 26, true) + view.getUint16(localAt + 28, true);
    const data = zip.subarray(dataAt, dataAt + size);
    expect(crc32(data)).toBe(crc);

    files.push({ path, text: decoder.decode(data) });
    at += 46 + nameLength;
  }
  return files;
}

describe('zip writer', () => {
  it('computes the standard CRC-32', () => {
    // The check value every CRC-32 implementation is tested against.
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
  });

  it('writes files that read back byte for byte', () => {
    const entries = [
      { path: 'folder/A.java', text: 'class A {}\n' },
      { path: 'folder/Note.txt', text: 'naïve ✓\n' },
    ];
    expect(readZip(buildZip(entries))).toEqual(entries);
  });
});

describe('the user-testing sample download', () => {
  it('is a zip of the sample files in one folder', async () => {
    const response = GET();

    expect(response.headers.get('content-type')).toBe('application/zip');
    expect(response.headers.get('content-disposition')).toContain('code-guru-sample-java.zip');

    const files = readZip(new Uint8Array(await response.arrayBuffer()));
    expect(files.map((f) => f.path)).toEqual(SAMPLE_JAVA_FILES.map((f) => `${SAMPLE_FOLDER}/${f.name}`));
  });

  it('has a README and the eight Java files, each a public class named after its file', () => {
    const java = SAMPLE_JAVA_FILES.filter((f) => f.name.endsWith('.java'));

    expect(SAMPLE_JAVA_FILES[0].name).toBe('README.txt');
    expect(java).toHaveLength(8);
    for (const file of java) {
      expect(file.text).toContain(`public class ${file.name.replace('.java', '')} {`);
    }
  });
});
