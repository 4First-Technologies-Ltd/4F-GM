import { Redirect } from 'expo-router';

/**
 * Without this, "/" is ambiguous: every route group has an index screen, so the
 * app opened on the first one alphabetically ((company), which calls the API
 * with no session) before the splash anchor took over.
 */
export default function Index() {
  return <Redirect href="/splash" />;
}
