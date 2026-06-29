import type { Feedback, Registration, SeedUserCredentials, WorkshopEvent } from "@/types/domain";

export const STUDY_TODAY = "2026-06-12";
export const DETERMINISTIC_NOW = "2026-06-12T09:00:00.000Z";

export const seedUsers: SeedUserCredentials[] = [
  {
    id: "user-001",
    fullName: "Ava Fischer",
    email: "ava.fischer@example.test",
    passwordHash:
      "3b289eb8101ac7c46d1fac005d989746d0e87ed2f2c15ad7c4e5fad72ebce3d67318b5aa066ae9c5f025f014dfab4fd294a972786f77bb98213985fb8b44c00d",
    passwordSalt: "seed-user-salt-001",
    passwordAlgorithm: "scrypt:16384:8:1:64",
    createdAt: DETERMINISTIC_NOW,
  },
];

export const seedEvents: WorkshopEvent[] = [
  {
    id: "event-001",
    ownerId: null,
    title: "Accessible Frontend Testing",
    description:
      "A hands-on workshop about semantic locators, visible validation states, and stable browser automation for frontend testing.",
    category: "Testing",
    date: "2026-07-03",
    time: "09:30",
    location: "Berlin Lab A",
    capacity: 18,
    speaker: "Mara Stein",
    status: "active",
  },
  {
    id: "event-002",
    ownerId: null,
    title: "Deterministic API Design",
    description:
      "Design route handlers and local state transitions that remain predictable during repeated test runs.",
    category: "Backend",
    date: "2026-07-10",
    time: "13:00",
    location: "Remote",
    capacity: 12,
    speaker: "Jonas Keller",
    status: "active",
  },
  {
    id: "event-003",
    ownerId: null,
    title: "React Forms Under Test",
    description:
      "Build explicit React forms with visible errors, clear labels, and reliable submission behavior.",
    category: "Frontend",
    date: "2026-07-17",
    time: "10:00",
    location: "Munich Studio",
    capacity: 4,
    speaker: "Lea Brandt",
    status: "active",
  },
  {
    id: "event-004",
    ownerId: null,
    title: "Workshop Facilitation Basics",
    description:
      "Plan practical sessions, manage registrations, and handle participant communication for technical workshops.",
    category: "Planning",
    date: "2026-08-05",
    time: "15:00",
    location: "Hamburg Hall",
    capacity: 20,
    speaker: "Nina Vogt",
    status: "active",
  },
  {
    id: "event-005",
    ownerId: null,
    title: "Cancelled Seed Event",
    description:
      "A deterministic cancelled event used to verify disabled calls to action and admin status behavior.",
    category: "Operations",
    date: "2026-08-21",
    time: "11:00",
    location: "Berlin Lab B",
    capacity: 10,
    speaker: "Felix Hartmann",
    status: "cancelled",
  },
];

export const seedRegistrations: Registration[] = [
  {
    id: "registration-001",
    ownerId: "user-001",
    eventId: "event-001",
    fullName: "Ava Fischer",
    email: "ava.fischer@example.test",
    phone: "+49 30 123456",
    participants: 2,
    note: "Needs invoice details after confirmation.",
    status: "active",
    registeredAt: "2026-06-12T09:15:00.000Z",
  },
  {
    id: "registration-002",
    ownerId: "user-001",
    eventId: "event-003",
    fullName: "Noah Weber",
    email: "noah.weber@example.test",
    phone: "",
    participants: 4,
    note: "",
    status: "active",
    registeredAt: "2026-06-12T09:20:00.000Z",
  },
  {
    id: "registration-003",
    ownerId: "user-001",
    eventId: "event-004",
    fullName: "Mila Roth",
    email: "mila.roth@example.test",
    phone: "+49 40 555010",
    participants: 1,
    note: "Vegetarian lunch.",
    status: "cancelled",
    registeredAt: "2026-06-12T09:25:00.000Z",
  },
];

export const seedFeedback: Feedback[] = [];
