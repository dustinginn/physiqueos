import { createUser } from "../../domain/models/user";

export const seedUser = createUser({
  id: "user_founder_001",
  firstName: "Dustin",
  lastName: "",
  email: "",
  timezone: "America/Los_Angeles",
  dateOfBirth: null,
  sex: "male",
  height: {
    value: 72,
    unit: "in",
  },
  avatarUrl:
    "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=200&q=80",
  createdAt: "2026-06-01T00:00:00.000Z",
  updatedAt: "2026-06-28T00:00:00.000Z",
});
