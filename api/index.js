import worker from '../src/index.js';

export default {
  /**
   * The Vercel Function entry point. It runs the Cloudflare Worker’s request handler as is, with
   * the environment variables read from `process.env` instead of the Worker’s `env` binding. All
   * the routes are rewritten to this function in `vercel.json`, and the request keeps its original
   * URL.
   * @param {Request} request - HTTP request.
   * @returns {Promise<Response>} HTTP response.
   * @see https://vercel.com/docs/functions/functions-api-reference#fetch-web-standard
   */
  fetch(request) {
    return worker.fetch(request, /** @type {{ [key: string]: string }} */ (process.env));
  },
};
