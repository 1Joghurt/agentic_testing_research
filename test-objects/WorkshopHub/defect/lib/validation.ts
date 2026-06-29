import { STUDY_TODAY } from "@/data/seed";
import type {
  AuthLoginInput,
  AuthRegisterInput,
  EventInput,
  FeedbackInput,
  RegistrationInput,
  ValidationResult,
  WorkshopEventWithSeats,
} from "@/types/domain";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const phonePattern = /^[+]?[\d\s().-]{6,24}$/;

export const requiredMessages = {
  name: "Full name is required.",
  email: "Email is required.",
  emailFormat: "Enter a valid email address.",
  phone: "Enter a valid phone number or leave it empty.",
  participants: "Participants must be at least 1.",
  terms: "Participation terms must be accepted.",
  capacity: "Participants must not exceed remaining seats.",
  ownEventRegistration: "You cannot register for your own workshop.",
  eventUnavailable: "Registration is not available for this event.",
  duplicateRegistration: "You are already registered for this event.",
  ownEventFeedback: "You cannot submit feedback for your own workshop.",
  title: "Title is required.",
  description: "Description is required.",
  category: "Category is required.",
  date: "Date must not be in the past.",
  time: "Time is required.",
  location: "Location is required.",
  eventCapacity: "Capacity must be a positive integer.",
  speaker: "Speaker or organizer is required.",
  rating: "Rating is required.",
  comment: "Comment must be at least 10 characters.",
  event: "Event is required.",
  password: "Password must be at least 8 characters.",
  credentials: "Email or password is incorrect.",
  emailAlreadyRegistered: "Email is already registered.",
};

function trimValue(value: string): string {
  return value.trim();
}

export function validateRegistration(
  input: RegistrationInput,
  event: WorkshopEventWithSeats | null,
): ValidationResult {
  const errors: Record<string, string> = {};

  if (!trimValue(input.fullName)) {
    errors.fullName = requiredMessages.name;
  }

  if (!trimValue(input.email)) {
    errors.email = requiredMessages.email;
  } else if (!emailPattern.test(input.email)) {
    errors.email = requiredMessages.emailFormat;
  }

  if (trimValue(input.phone) && !phonePattern.test(input.phone)) {
    errors.phone = requiredMessages.phone;
  }

  if (!Number.isInteger(input.participants) || input.participants < 1) {
    errors.participants = requiredMessages.participants;
  }

  if (!input.termsAccepted) {
    errors.termsAccepted = requiredMessages.terms;
  }

  if (event?.status !== "active" || event.remainingSeats <= 0) {
    errors.event = requiredMessages.eventUnavailable;
  } else if (input.participants >= event.remainingSeats) {
    errors.participants = requiredMessages.capacity;
  }

  return { valid: Object.keys(errors).length === 0, errors };
}

export function validateRegistrationUpdate(
  input: RegistrationInput,
  event: WorkshopEventWithSeats | null,
): ValidationResult {
  const errors: Record<string, string> = {};

  if (!trimValue(input.fullName)) {
    errors.fullName = requiredMessages.name;
  }

  if (!trimValue(input.email)) {
    errors.email = requiredMessages.email;
  } else if (!emailPattern.test(input.email)) {
    errors.email = requiredMessages.emailFormat;
  }

  if (trimValue(input.phone) && !phonePattern.test(input.phone)) {
    errors.phone = requiredMessages.phone;
  }

  if (!Number.isInteger(input.participants) || input.participants < 0) {
    errors.participants = "Participants must be 0 or greater.";
  }

  if (!input.termsAccepted) {
    errors.termsAccepted = requiredMessages.terms;
  }

  if (event?.status !== "active") {
    errors.event = requiredMessages.eventUnavailable;
  } else if (input.participants > event.remainingSeats) {
    errors.participants = requiredMessages.capacity;
  }

  return { valid: Object.keys(errors).length === 0, errors };
}

export function validateAuthRegistration(input: AuthRegisterInput): ValidationResult {
  const errors: Record<string, string> = {};

  if (!trimValue(input.fullName)) {
    errors.fullName = requiredMessages.name;
  }
  if (!trimValue(input.email)) {
    errors.email = requiredMessages.email;
  } else if (!emailPattern.test(input.email)) {
    errors.email = requiredMessages.emailFormat;
  }
  if (input.password.length < 8) {
    errors.password = requiredMessages.password;
  }

  return { valid: Object.keys(errors).length === 0, errors };
}

export function validateAuthLogin(input: AuthLoginInput): ValidationResult {
  const errors: Record<string, string> = {};

  if (!trimValue(input.email)) {
    errors.email = requiredMessages.email;
  } else if (!emailPattern.test(input.email)) {
    errors.email = requiredMessages.emailFormat;
  }
  if (!input.password) {
    errors.password = requiredMessages.password;
  }

  return { valid: Object.keys(errors).length === 0, errors };
}

export function validateEvent(input: EventInput): ValidationResult {
  const errors: Record<string, string> = {};

  if (!trimValue(input.title)) {
    errors.title = requiredMessages.title;
  }
  if (!trimValue(input.description)) {
    errors.description = requiredMessages.description;
  }
  if (!trimValue(input.category)) {
    errors.category = requiredMessages.category;
  }
  if (!input.date || input.date < STUDY_TODAY) {
    errors.date = requiredMessages.date;
  }
  if (!trimValue(input.time)) {
    errors.time = requiredMessages.time;
  }
  if (!trimValue(input.location)) {
    errors.location = requiredMessages.location;
  }
  if (!Number.isInteger(input.capacity) || input.capacity <= 0) {
    errors.capacity = requiredMessages.eventCapacity;
  }
  if (!trimValue(input.speaker)) {
    errors.speaker = requiredMessages.speaker;
  }

  return { valid: Object.keys(errors).length === 0, errors };
}

export function validateFeedback(input: FeedbackInput): ValidationResult {
  const errors: Record<string, string> = {};

  if (!trimValue(input.eventId)) {
    errors.eventId = requiredMessages.event;
  }
  if (!Number.isInteger(input.rating) || input.rating < 1 || input.rating > 5) {
    errors.rating = requiredMessages.rating;
  }
  if (trimValue(input.comment).length < 10) {
    errors.comment = requiredMessages.comment;
  }

  return { valid: Object.keys(errors).length === 0, errors };
}
