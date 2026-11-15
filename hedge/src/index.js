export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.hostname === "www.rn.ax") {
      url.hostname = "rn.ax";
      return Response.redirect(url.toString(), 301);
    }
    return env.ASSETS.fetch(request);
  },
};
