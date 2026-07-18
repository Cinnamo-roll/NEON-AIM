import type { CareerProjectDataset } from "./careerProjectModule";

const MAX_CACHED_PROJECTS = 24;
const datasetCache = new Map<string, CareerProjectDataset>();

function cacheKey(userId: string, projectId: string) {
  return `${userId}:${projectId}`;
}

export function readCareerProjectDatasetCache(userId: string | undefined, projectId: string) {
  if (!userId) return null;
  const key = cacheKey(userId, projectId);
  const dataset = datasetCache.get(key);
  if (!dataset) return null;

  datasetCache.delete(key);
  datasetCache.set(key, dataset);
  return dataset;
}

export function writeCareerProjectDatasetCache(
  userId: string | undefined,
  projectId: string,
  dataset: CareerProjectDataset,
) {
  if (!userId) return;
  const key = cacheKey(userId, projectId);
  datasetCache.delete(key);
  datasetCache.set(key, dataset);

  while (datasetCache.size > MAX_CACHED_PROJECTS) {
    const oldestKey = datasetCache.keys().next().value;
    if (oldestKey === undefined) break;
    datasetCache.delete(oldestKey);
  }
}

export function clearCareerProjectDatasetCache() {
  datasetCache.clear();
}
