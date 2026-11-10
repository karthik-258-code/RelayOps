export function chunkValues<T>(values: T[], chunkSize: number): T[][] {
  if (!Number.isInteger(chunkSize) || chunkSize < 1) throw new RangeError('Chunk size must be a positive integer.');
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += chunkSize) chunks.push(values.slice(index, index + chunkSize));
  return chunks;
}
