// Build-time only: renders the app for one page to HTML, so each public page
// ships with its real content for search engines and link previews. In the
// browser the app then renders on top as usual (main.tsx), so visitors see
// no difference.
import { renderToString } from 'react-dom/server';
import App from './App';

export { PAGE_META, SITE_URL, structuredData } from './pageMeta';

export function render() {
  return renderToString(<App />);
}
