export interface LibraryLoadState {
  isLoading: boolean;
  hasLoaded: boolean;
  force?: boolean;
}

export function shouldSkipLibraryLoad({ isLoading, hasLoaded, force = false }: LibraryLoadState): boolean {
  if (force) {
    return false;
  }

  if (isLoading) {
    return true;
  }

  // A first load is allowed; a second call while the state is already settled and
  // hydrated is also allowed because reload paths legitimately re-fetch data.
  if (hasLoaded) {
    return false;
  }

  return false;
}
