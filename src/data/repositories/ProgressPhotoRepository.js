import { seedProgressPhotos } from "../seed/progressPhotos";
import { byDateRange, byUserId } from "./repositoryUtils";

export function createProgressPhotoRepository(progressPhotos = [], options = {}) {
  return {
    async listPhotos(userId, range = {}) {
      return byDateRange(byUserId(progressPhotos, userId), "date", range);
    },

    async getPhotosByDate(userId, date) {
      return byUserId(progressPhotos, userId).filter(
        (photo) => getDateKey(photo.date || photo.capturedAt) === date
      );
    },

    async getLatestPhotos(userId, limit = 4) {
      return [...byUserId(progressPhotos, userId)]
        .sort((a, b) => getSortDate(b).localeCompare(getSortDate(a)))
        .slice(0, limit);
    },

    async createPhoto(photo) {
      progressPhotos.push(photo);
      options.onChange?.();

      return photo;
    },

    async upsertPhoto(photo) {
      const index = progressPhotos.findIndex((item) => item.id === photo.id);
      if (index >= 0) progressPhotos[index] = photo;
      else progressPhotos.push(photo);
      options.onChange?.();
      return photo;
    },

    async importPhotos(photos, source) {
      const importedPhotos = photos.map((photo) => ({
        ...photo,
        source: photo.source ?? source,
      }));

      progressPhotos.push(...importedPhotos);
      options.onChange?.();

      return importedPhotos;
    },
  };
}

export const ProgressPhotoRepository =
  createProgressPhotoRepository(seedProgressPhotos);

function getDateKey(value) {
  return value?.slice(0, 10) ?? "";
}

function getSortDate(photo) {
  return photo.capturedAt ?? photo.date ?? "";
}
