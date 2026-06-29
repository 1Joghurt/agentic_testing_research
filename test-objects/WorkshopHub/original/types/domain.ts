export type EventStatus = "active" | "cancelled";
export type RegistrationStatus = "active" | "cancelled";

export interface WorkshopEvent {
  id: string;
  ownerId: string | null;
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

export interface WorkshopEventWithSeats extends WorkshopEvent {
  remainingSeats: number;
  seatStatus: "Open" | "Few seats left" | "Fully booked" | "Cancelled";
}

export interface Registration {
  id: string;
  ownerId: string;
  eventId: string;
  fullName: string;
  email: string;
  phone: string;
  participants: number;
  note: string;
  status: RegistrationStatus;
  registeredAt: string;
}

export interface RegistrationWithEvent extends Registration {
  eventTitle: string;
}

export interface Feedback {
  id: string;
  eventId: string;
  rating: number;
  comment: string;
  recommend: boolean;
  submittedAt: string;
}

export interface FeedbackWithEvent extends Feedback {
  eventTitle: string;
}

export interface User {
  id: string;
  fullName: string;
  email: string;
  createdAt: string;
}

export interface UserCredentials extends User {
  passwordHash: string;
  passwordSalt: string;
  passwordAlgorithm: string;
}

export interface SeedUserCredentials extends UserCredentials {
  createdAt: string;
}

export interface AuthRegisterInput {
  fullName: string;
  email: string;
  password: string;
}

export interface AuthLoginInput {
  email: string;
  password: string;
}

export interface RegistrationInput {
  eventId: string;
  fullName: string;
  email: string;
  phone: string;
  participants: number;
  note: string;
  termsAccepted: boolean;
}

export interface EventInput {
  title: string;
  description: string;
  category: string;
  date: string;
  time: string;
  location: string;
  capacity: number;
  speaker: string;
}

export interface FeedbackInput {
  eventId: string;
  rating: number;
  comment: string;
  recommend: boolean;
}

export interface ValidationResult {
  valid: boolean;
  errors: Record<string, string>;
}
