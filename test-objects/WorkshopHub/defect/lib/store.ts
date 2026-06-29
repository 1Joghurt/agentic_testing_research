import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";

import {
  DETERMINISTIC_NOW,
  seedEvents,
  seedFeedback,
  seedRegistrations,
  seedUsers,
} from "@/data/seed";
import type {
  AuthRegisterInput,
  EventInput,
  EventStatus,
  Feedback,
  FeedbackInput,
  FeedbackWithEvent,
  Registration,
  RegistrationInput,
  RegistrationStatus,
  RegistrationWithEvent,
  User,
  UserCredentials,
  WorkshopEvent,
  WorkshopEventWithSeats,
} from "@/types/domain";
import {
  requiredMessages,
  validateAuthRegistration,
  validateEvent,
  validateFeedback,
  validateRegistration,
  validateRegistrationUpdate,
} from "./validation";

const DEFAULT_DATABASE_PATH = join(process.cwd(), ".workshophub", "workshophub.sqlite");

interface GlobalWithWorkshopHubDatabase {
  __workshopHubDatabase?: DatabaseSync;
}

interface EventRow {
  id: string;
  owner_id: string | null;
  title: string;
  description: string;
  category: string;
  date: string;
  time: string;
  location: string;
  capacity: number;
  speaker: string;
  status: EventStatus;
}

interface RegistrationRow {
  id: string;
  owner_id: string;
  event_id: string;
  full_name: string;
  email: string;
  phone: string;
  participants: number;
  note: string;
  status: RegistrationStatus;
  registered_at: string;
}

interface UserRow {
  id: string;
  full_name: string;
  email: string;
  password_hash: string;
  password_salt: string;
  password_algorithm: string;
  created_at: string;
}

interface FeedbackRow {
  id: string;
  event_id: string;
  rating: number;
  comment: string;
  recommend: number;
  submitted_at: string;
}

interface MetaRow {
  value: string;
}

function databasePath(): string {
  return process.env.WORKSHOPHUB_DB_PATH ?? DEFAULT_DATABASE_PATH;
}

function getDatabase(): DatabaseSync {
  const storeGlobal = globalThis as GlobalWithWorkshopHubDatabase;
  if (!storeGlobal.__workshopHubDatabase) {
    const path = databasePath();
    mkdirSync(dirname(path), { recursive: true });
    const database = new DatabaseSync(path);
    database.exec("PRAGMA foreign_keys = ON;");
    storeGlobal.__workshopHubDatabase = database;
  }

  const database = storeGlobal.__workshopHubDatabase;
  createSchema(database);
  seedIfEmpty(database);
  ensureSeedUsers(database);
  ensureSeedRegistrationOwners(database);
  ensureAuthCounters(database);

  return storeGlobal.__workshopHubDatabase;
}

function createSchema(database: DatabaseSync): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY,
      owner_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      category TEXT NOT NULL,
      date TEXT NOT NULL,
      time TEXT NOT NULL,
      location TEXT NOT NULL,
      capacity INTEGER NOT NULL CHECK (capacity > 0),
      speaker TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('active', 'cancelled'))
    );

    CREATE TABLE IF NOT EXISTS registrations (
      id TEXT PRIMARY KEY,
      owner_id TEXT REFERENCES users(id) ON DELETE CASCADE,
      event_id TEXT NOT NULL REFERENCES events(id),
      full_name TEXT NOT NULL,
      email TEXT NOT NULL,
      phone TEXT NOT NULL,
      participants INTEGER NOT NULL CHECK (participants > 0),
      note TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('active', 'cancelled')),
      registered_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS feedback (
      id TEXT PRIMARY KEY,
      event_id TEXT NOT NULL REFERENCES events(id),
      rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
      comment TEXT NOT NULL,
      recommend INTEGER NOT NULL CHECK (recommend IN (0, 1)),
      submitted_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      full_name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      password_salt TEXT NOT NULL,
      password_algorithm TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS user_sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS app_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  ensureEventOwnerColumn(database);
  ensureRegistrationOwnerColumn(database);
}

function runTransaction(database: DatabaseSync, callback: () => void): void {
  database.exec("BEGIN IMMEDIATE;");
  try {
    callback();
    database.exec("COMMIT;");
  } catch (error) {
    database.exec("ROLLBACK;");
    throw error;
  }
}

function seedIfEmpty(database: DatabaseSync): void {
  const row = database.prepare("SELECT COUNT(*) AS count FROM events").get() as { count: number };
  if (row.count === 0) {
    resetDatabase(database);
  }
}

function ensureEventOwnerColumn(database: DatabaseSync): void {
  const columns = database.prepare("PRAGMA table_info(events)").all() as unknown as Array<{ name: string }>;
  if (!columns.some((column) => column.name === "owner_id")) {
    database.exec("ALTER TABLE events ADD COLUMN owner_id TEXT REFERENCES users(id) ON DELETE SET NULL;");
  }
}

function ensureRegistrationOwnerColumn(database: DatabaseSync): void {
  const columns = database.prepare("PRAGMA table_info(registrations)").all() as unknown as Array<{ name: string }>;
  if (!columns.some((column) => column.name === "owner_id")) {
    database.exec("ALTER TABLE registrations ADD COLUMN owner_id TEXT REFERENCES users(id) ON DELETE CASCADE;");
  }
}

function ensureSeedUsers(database: DatabaseSync): void {
  const insertUser = database.prepare(`
    INSERT OR IGNORE INTO users (
      id, full_name, email, password_hash, password_salt, password_algorithm, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  for (const user of seedUsers) {
    insertUser.run(
      user.id,
      user.fullName,
      user.email,
      user.passwordHash,
      user.passwordSalt,
      user.passwordAlgorithm,
      user.createdAt,
    );
  }
}

function ensureSeedRegistrationOwners(database: DatabaseSync): void {
  database.prepare("UPDATE registrations SET owner_id = ? WHERE owner_id IS NULL").run(seedUsers[0]?.id ?? "user-001");
}

function resetDatabase(database: DatabaseSync): void {
  runTransaction(database, () => {
    database.exec(`
      DELETE FROM feedback;
      DELETE FROM registrations;
      DELETE FROM events;
      DELETE FROM user_sessions;
      DELETE FROM users;
      DELETE FROM app_meta;
    `);

    const insertEvent = database.prepare(`
      INSERT INTO events (
        id, owner_id, title, description, category, date, time, location, capacity, speaker, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const event of seedEvents) {
      insertEvent.run(
        event.id,
        null,
        event.title,
        event.description,
        event.category,
        event.date,
        event.time,
        event.location,
        event.capacity,
        event.speaker,
        event.status,
      );
    }

    const insertUser = database.prepare(`
      INSERT INTO users (
        id, full_name, email, password_hash, password_salt, password_algorithm, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    for (const user of seedUsers) {
      insertUser.run(
        user.id,
        user.fullName,
        user.email,
        user.passwordHash,
        user.passwordSalt,
        user.passwordAlgorithm,
        user.createdAt,
      );
    }

    const insertRegistration = database.prepare(`
      INSERT INTO registrations (
        id, owner_id, event_id, full_name, email, phone, participants, note, status, registered_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const registration of seedRegistrations) {
      insertRegistration.run(
        registration.id,
        registration.ownerId,
        registration.eventId,
        registration.fullName,
        registration.email,
        registration.phone,
        registration.participants,
        registration.note,
        registration.status,
        registration.registeredAt,
      );
    }

    const insertFeedback = database.prepare(`
      INSERT INTO feedback (
        id, event_id, rating, comment, recommend, submitted_at
      ) VALUES (?, ?, ?, ?, ?, ?)
    `);
    for (const feedback of seedFeedback) {
      insertFeedback.run(
        feedback.id,
        feedback.eventId,
        feedback.rating,
        feedback.comment,
        feedback.recommend ? 1 : 0,
        feedback.submittedAt,
      );
    }

    setCounter(database, "nextEventNumber", seedEvents.length + 1);
    setCounter(database, "nextRegistrationNumber", seedRegistrations.length + 1);
    setCounter(database, "nextFeedbackNumber", seedFeedback.length + 1);
    setCounter(database, "nextUserNumber", seedUsers.length + 1);
    setCounter(database, "nextSessionNumber", 1);
  });
}

function ensureAuthCounters(database: DatabaseSync): void {
  const userCounter = database.prepare("SELECT value FROM app_meta WHERE key = ?").get("nextUserNumber");
  if (!userCounter) {
    const row = database.prepare("SELECT COUNT(*) AS count FROM users").get() as { count: number };
    setCounter(database, "nextUserNumber", row.count + 1);
  }

  const sessionCounter = database.prepare("SELECT value FROM app_meta WHERE key = ?").get("nextSessionNumber");
  if (!sessionCounter) {
    const row = database.prepare("SELECT COUNT(*) AS count FROM user_sessions").get() as { count: number };
    setCounter(database, "nextSessionNumber", row.count + 1);
  }
}

function eventFromRow(row: EventRow): WorkshopEvent {
  return {
    id: row.id,
    ownerId: row.owner_id,
    title: row.title,
    description: row.description,
    category: row.category,
    date: row.date,
    time: row.time,
    location: row.location,
    capacity: row.capacity,
    speaker: row.speaker,
    status: row.status,
  };
}

function registrationFromRow(row: RegistrationRow): Registration {
  return {
    id: row.id,
    ownerId: row.owner_id,
    eventId: row.event_id,
    fullName: row.full_name,
    email: row.email,
    phone: row.phone,
    participants: row.participants,
    note: row.note,
    status: row.status,
    registeredAt: row.registered_at,
  };
}

function feedbackFromRow(row: FeedbackRow): Feedback {
  return {
    id: row.id,
    eventId: row.event_id,
    rating: row.rating,
    comment: row.comment,
    recommend: row.recommend === 1,
    submittedAt: row.submitted_at,
  };
}

function userFromRow(row: UserRow): User {
  return {
    id: row.id,
    fullName: row.full_name,
    email: row.email,
    createdAt: row.created_at,
  };
}

function userCredentialsFromRow(row: UserRow): UserCredentials {
  return {
    ...userFromRow(row),
    passwordHash: row.password_hash,
    passwordSalt: row.password_salt,
    passwordAlgorithm: row.password_algorithm,
  };
}

function setCounter(database: DatabaseSync, key: string, value: number): void {
  database
    .prepare(
      "INSERT INTO app_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    )
    .run(key, String(value));
}

function getCounter(database: DatabaseSync, key: string): number {
  const row = database.prepare("SELECT value FROM app_meta WHERE key = ?").get(key) as MetaRow | undefined;
  if (!row) {
    throw new Error(`Missing deterministic counter: ${key}`);
  }

  return Number.parseInt(row.value, 10);
}

function nextId(database: DatabaseSync, prefix: string, counterKey: string): string {
  const number = getCounter(database, counterKey);
  setCounter(database, counterKey, number + 1);
  return `${prefix}-${String(number).padStart(3, "0")}`;
}

function activeParticipantsForEvent(eventId: string): number {
  const row = getDatabase()
    .prepare(
      "SELECT COALESCE(SUM(participants), 0) AS total FROM registrations WHERE event_id = ? AND status = 'active'",
    )
    .get(eventId) as { total: number };
  return row.total;
}

export function withSeatInfo(event: WorkshopEvent): WorkshopEventWithSeats {
  const remainingSeats = Math.max(event.capacity - activeParticipantsForEvent(event.id), 0);
  let seatStatus: WorkshopEventWithSeats["seatStatus"] = "Open";

  if (event.status === "cancelled") {
    seatStatus = "Cancelled";
  } else if (remainingSeats === 0) {
    seatStatus = "Fully booked";
  } else if (remainingSeats <= 3) {
    seatStatus = "Few seats left";
  }

  return { ...event, remainingSeats, seatStatus };
}

export function listEvents(): WorkshopEventWithSeats[] {
  const rows = getDatabase()
    .prepare("SELECT * FROM events ORDER BY id")
    .all() as unknown as EventRow[];
  return rows.map(eventFromRow).map(withSeatInfo);
}

export function listEventsByOwner(ownerId: string): WorkshopEventWithSeats[] {
  const rows = getDatabase()
    .prepare("SELECT * FROM events WHERE owner_id = ? ORDER BY id")
    .all(ownerId) as unknown as EventRow[];
  return rows.map(eventFromRow).map(withSeatInfo);
}

export function getEventById(id: string): WorkshopEventWithSeats | null {
  const row = getDatabase().prepare("SELECT * FROM events WHERE id = ?").get(id) as EventRow | undefined;
  return row ? withSeatInfo(eventFromRow(row)) : null;
}

export function createUser(
  input: AuthRegisterInput,
  passwordHash: string,
  passwordSalt: string,
  passwordAlgorithm: string,
): { user?: User; errors?: Record<string, string> } {
  const validation = validateAuthRegistration(input);
  if (!validation.valid) {
    return { errors: validation.errors };
  }

  const database = getDatabase();
  const normalizedEmail = input.email.trim().toLowerCase();
  const existing = database.prepare("SELECT id FROM users WHERE email = ?").get(normalizedEmail);
  if (existing) {
    return { errors: { email: requiredMessages.emailAlreadyRegistered } };
  }

  let userId = "";
  runTransaction(database, () => {
    userId = nextId(database, "user", "nextUserNumber");
    database
      .prepare(`
        INSERT INTO users (
          id, full_name, email, password_hash, password_salt, password_algorithm, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        userId,
        input.fullName.trim(),
        normalizedEmail,
        passwordHash,
        passwordSalt,
        passwordAlgorithm,
        DETERMINISTIC_NOW,
      );
  });

  return { user: getUserById(userId) ?? undefined };
}

export function getUserById(id: string): User | null {
  const row = getDatabase().prepare("SELECT * FROM users WHERE id = ?").get(id) as UserRow | undefined;
  return row ? userFromRow(row) : null;
}

export function getUserCredentialsByEmail(email: string): UserCredentials | null {
  const row = getDatabase()
    .prepare("SELECT * FROM users WHERE email = ?")
    .get(email.trim().toLowerCase()) as UserRow | undefined;
  return row ? userCredentialsFromRow(row) : null;
}

export function createUserSession(
  userId: string,
  tokenHash: string,
  expiresAt: string,
): { sessionId: string; user?: User } {
  const database = getDatabase();
  let sessionId = "";
  runTransaction(database, () => {
    sessionId = nextId(database, "session", "nextSessionNumber");
    database
      .prepare(`
        INSERT INTO user_sessions (id, user_id, token_hash, created_at, expires_at)
        VALUES (?, ?, ?, ?, ?)
      `)
      .run(sessionId, userId, tokenHash, DETERMINISTIC_NOW, expiresAt);
  });

  return { sessionId, user: getUserById(userId) ?? undefined };
}

export function getUserBySessionTokenHash(tokenHash: string, nowIso: string): User | null {
  const row = getDatabase()
    .prepare(`
      SELECT users.*
      FROM user_sessions
      INNER JOIN users ON users.id = user_sessions.user_id
      WHERE user_sessions.token_hash = ? AND user_sessions.expires_at > ?
    `)
    .get(tokenHash, nowIso) as UserRow | undefined;
  return row ? userFromRow(row) : null;
}

export function deleteSessionByTokenHash(tokenHash: string): void {
  getDatabase().prepare("DELETE FROM user_sessions WHERE token_hash = ?").run(tokenHash);
}

export function createEvent(input: EventInput, ownerId: string): { event?: WorkshopEventWithSeats; errors?: Record<string, string> } {
  const validation = validateEvent(input);
  if (!validation.valid) {
    return { errors: validation.errors };
  }

  const database = getDatabase();
  let event: WorkshopEvent | undefined;
  runTransaction(database, () => {
    event = {
      id: nextId(database, "event", "nextEventNumber"),
      ownerId,
      ...input,
      title: input.title.trim(),
      description: input.description.trim(),
      category: input.category.trim(),
      location: input.location.trim(),
      speaker: input.speaker.trim(),
      status: "active",
    };

    database
      .prepare(`
        INSERT INTO events (
          id, owner_id, title, description, category, date, time, location, capacity, speaker, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        event.id,
        event.ownerId,
        event.title,
        event.description,
        event.category,
        event.date,
        event.time,
        event.location,
        event.capacity,
        event.speaker,
        event.status,
      );
  });

  return { event: event ? withSeatInfo(event) : undefined };
}

export function updateEvent(
  id: string,
  input: EventInput,
  ownerId: string,
): { event?: WorkshopEventWithSeats; errors?: Record<string, string>; notFound?: boolean; forbidden?: boolean } {
  const validation = validateEvent(input);
  if (!validation.valid) {
    return { errors: validation.errors };
  }

  const database = getDatabase();
  const existing = getEventById(id);
  if (!existing) {
    return { notFound: true };
  }
  if (existing.ownerId !== ownerId) {
    return { forbidden: true };
  }

  const updated: WorkshopEvent = {
    ...existing,
    ...input,
    title: input.title.trim(),
    description: input.description.trim(),
    category: input.category.trim(),
    location: existing.location,
    speaker: input.speaker.trim(),
  };

  database
    .prepare(`
      UPDATE events
      SET title = ?, description = ?, category = ?, date = ?, time = ?, location = ?, capacity = ?, speaker = ?
      WHERE id = ?
    `)
    .run(
      updated.title,
      updated.description,
      updated.category,
      updated.date,
      updated.time,
      updated.location,
      updated.capacity,
      updated.speaker,
      id,
    );

  return { event: withSeatInfo(updated) };
}

export function cancelEvent(id: string, ownerId: string): { event?: WorkshopEventWithSeats; notFound?: boolean; forbidden?: boolean } {
  const existing = getEventById(id);
  if (!existing) {
    return { notFound: true };
  }
  if (existing.ownerId !== ownerId) {
    return { forbidden: true };
  }

  const result = getDatabase().prepare("UPDATE events SET status = 'cancelled' WHERE id = ?").run(id);
  if (result.changes === 0) {
    return { notFound: true };
  }

  return { event: getEventById(id) ?? undefined };
}

export function listRegistrations(): RegistrationWithEvent[] {
  return listRegistrationsQuery();
}

export function listRegistrationsByOwner(ownerId: string): RegistrationWithEvent[] {
  return listRegistrationsQuery(ownerId);
}

function listRegistrationsQuery(ownerId?: string): RegistrationWithEvent[] {
  const whereClause = ownerId ? "WHERE registrations.owner_id = ?" : "";
  const rows = getDatabase()
    .prepare(`
      SELECT
        registrations.*,
        COALESCE(events.title, 'Unknown event') AS event_title
      FROM registrations
      LEFT JOIN events ON events.id = registrations.event_id
      ${whereClause}
      ORDER BY registrations.id
    `)
    .all(...(ownerId ? [ownerId] : [])) as unknown as Array<RegistrationRow & { event_title: string }>;

  return rows.map((row) => ({
    ...registrationFromRow(row),
    eventTitle: row.event_title,
  }));
}

export function getRegistrationById(id: string, ownerId?: string): RegistrationWithEvent | null {
  const registrations = ownerId ? listRegistrationsByOwner(ownerId) : listRegistrations();
  return registrations.find((registration) => registration.id === id) ?? null;
}

export function createRegistration(
  input: RegistrationInput,
  owner: User,
): { registration?: RegistrationWithEvent; event?: WorkshopEventWithSeats; errors?: Record<string, string> } {
  const normalizedInput = {
    ...input,
    fullName: owner.fullName,
    email: owner.email,
  };
  const event = getEventById(normalizedInput.eventId);
  if (event?.ownerId === owner.id) {
    return { errors: { event: requiredMessages.ownEventRegistration } };
  }
  const validation = validateRegistration(normalizedInput, event);
  if (!validation.valid) {
    return { errors: validation.errors };
  }

  const existingActiveRegistration = listRegistrationsByOwner(owner.id).find(
    (registration) => registration.eventId === normalizedInput.eventId && registration.status === "active",
  );
  if (existingActiveRegistration) {
    return { errors: { event: requiredMessages.duplicateRegistration } };
  }

  const database = getDatabase();
  let registrationId = "";
  runTransaction(database, () => {
    registrationId = nextId(database, "registration", "nextRegistrationNumber");
    database
      .prepare(`
        INSERT INTO registrations (
          id, owner_id, event_id, full_name, email, phone, participants, note, status, registered_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        registrationId,
        owner.id,
        normalizedInput.eventId,
        normalizedInput.fullName,
        normalizedInput.email,
        normalizedInput.phone.trim(),
        normalizedInput.participants,
        normalizedInput.note.trim(),
        "active",
        DETERMINISTIC_NOW,
      );
  });

  const registrationWithEvent = listRegistrationsByOwner(owner.id).find((candidate) => candidate.id === registrationId);
  return {
    registration: registrationWithEvent,
    event: getEventById(normalizedInput.eventId) ?? undefined,
  };
}

export function updateRegistration(
  id: string,
  input: RegistrationInput,
  owner: User,
): { registration?: RegistrationWithEvent; event?: WorkshopEventWithSeats; errors?: Record<string, string>; notFound?: boolean } {
  const existing = getRegistrationById(id, owner.id);
  if (!existing) {
    return { notFound: true };
  }

  if (existing.status === "cancelled") {
    return { errors: { registration: "Cancelled registrations cannot be edited." } };
  }

  const event = getEventById(existing.eventId);
  if (event?.ownerId === owner.id) {
    return { errors: { event: requiredMessages.ownEventRegistration } };
  }
  const eventForValidation = event
    ? { ...event, remainingSeats: event.remainingSeats + existing.participants }
    : null;
  const normalizedInput = {
    ...input,
    eventId: existing.eventId,
    fullName: owner.fullName,
    email: owner.email,
  };
  const validation = validateRegistrationUpdate(normalizedInput, eventForValidation);
  if (!validation.valid) {
    return { errors: validation.errors };
  }

  const database = getDatabase();
  if (input.participants === 0) {
    database.prepare("UPDATE registrations SET status = 'cancelled' WHERE id = ?").run(id);
    return {
      registration: getRegistrationById(id, owner.id) ?? undefined,
      event: getEventById(existing.eventId) ?? undefined,
    };
  }

  database
    .prepare(`
      UPDATE registrations
      SET full_name = ?, email = ?, phone = ?, participants = ?, note = ?
      WHERE id = ?
    `)
    .run(
      normalizedInput.fullName,
      normalizedInput.email,
      normalizedInput.phone.trim(),
      normalizedInput.participants,
      normalizedInput.note.trim(),
      id,
    );

  return {
    registration: getRegistrationById(id, owner.id) ?? undefined,
    event: getEventById(existing.eventId) ?? undefined,
  };
}

export function cancelRegistration(
  id: string,
  ownerId: string,
): { registration?: RegistrationWithEvent; event?: WorkshopEventWithSeats; notFound?: boolean } {
  const database = getDatabase();
  const row = database.prepare("SELECT event_id FROM registrations WHERE id = ? AND owner_id = ?").get(id, ownerId) as
    | { event_id: string }
    | undefined;
  if (!row) {
    return { notFound: true };
  }

  database.prepare("UPDATE registrations SET status = 'cancelled' WHERE owner_id = ?").run(ownerId);
  return {
    registration: listRegistrationsByOwner(ownerId).find((candidate) => candidate.id === id),
    event: getEventById(row.event_id) ?? undefined,
  };
}

export function createFeedback(
  input: FeedbackInput,
  submitterId: string,
): { feedback?: Feedback; errors?: Record<string, string>; notFound?: boolean } {
  const validation = validateFeedback(input);
  if (!validation.valid) {
    return { errors: validation.errors };
  }
  const event = getEventById(input.eventId);
  if (!event) {
    return { notFound: true };
  }
  if (event.ownerId === submitterId) {
    return { errors: { eventId: requiredMessages.ownEventFeedback } };
  }

  const database = getDatabase();
  let feedbackId = "";
  runTransaction(database, () => {
    feedbackId = nextId(database, "feedback", "nextFeedbackNumber");
    database
      .prepare(`
        INSERT INTO feedback (
          id, event_id, rating, comment, recommend, submitted_at
        ) VALUES (?, ?, ?, ?, ?, ?)
      `)
      .run(
        feedbackId,
        input.eventId,
        input.rating,
        input.comment.trim(),
        input.recommend ? 1 : 0 ,
        DETERMINISTIC_NOW,
      );
  });

  const row = database.prepare("SELECT * FROM feedback WHERE id = ?").get(feedbackId) as FeedbackRow | undefined;
  return { feedback: row ? feedbackFromRow(row) : undefined };
}

export function listFeedbackByEventOwner(ownerId: string): FeedbackWithEvent[] {
  const rows = getDatabase()
    .prepare(`
      SELECT feedback.*, events.title AS event_title
      FROM feedback
      INNER JOIN events ON events.id = feedback.event_id
      WHERE events.owner_id = ?
      ORDER BY feedback.submitted_at DESC, feedback.id DESC
    `)
    .all(ownerId) as unknown as Array<FeedbackRow & { event_title: string }>;

  return rows.map((row) => ({
    ...feedbackFromRow(row),
    eventTitle: row.event_title,
  }));
}
