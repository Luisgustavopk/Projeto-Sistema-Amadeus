export interface RevisionRepository {
  read(key: string): Promise<string | null>;
  compareAndSave(
    key: string,
    previous: string | null,
    value: string,
  ): Promise<boolean>;
}
