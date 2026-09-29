import { BookRepository } from './BookRepository';
import { SQLiteBookRepository } from './SQLiteBookRepository';

export type { BookRepository } from './BookRepository';
export { SQLiteBookRepository } from './SQLiteBookRepository';
export { InMemoryBookRepository } from './InMemoryBookRepository';

let defaultRepo: BookRepository = new SQLiteBookRepository();

export function getBookRepository(): BookRepository {
  return defaultRepo;
}

export function setBookRepository(repo: BookRepository): void {
  defaultRepo = repo;
}