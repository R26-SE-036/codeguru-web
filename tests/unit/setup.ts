import { randomBytes } from 'node:crypto';

// The session cookie is sealed with this key. A fresh one per run: tests must
// never depend on, or be able to read cookies sealed with, a real key.
process.env.SESSION_ENCRYPTION_KEY = randomBytes(32).toString('base64');

// Backend addresses as the compose stack sets them, so a URL assertion in a
// test reads like the request production would actually make.
process.env.CODE_COACH_URL = 'http://code-coach:8080';
process.env.STUDY_GUIDER_URL = 'http://study-guider:8010';
process.env.PAIRPATH_URL = 'http://pairpath-api:3001';
process.env.GAMIFICATION_URL = 'http://gamification-api:3002';
