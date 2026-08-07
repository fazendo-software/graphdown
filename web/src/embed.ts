/** URL segura para um iframe; links comuns do YouTube viram o player sem cookies. */
export function urlDoEmbed(valor: unknown): string | undefined {
  if (typeof valor !== "string" || !valor.trim()) return undefined;
  try {
    const url = new URL(valor.trim());
    if (url.protocol !== "https:") return undefined;
    const host = url.hostname.replace(/^www\./, "").toLowerCase();
    let video: string | null = null;
    if (host === "youtu.be") video = url.pathname.split("/").filter(Boolean)[0] ?? null;
    if (["youtube.com", "m.youtube.com", "music.youtube.com"].includes(host)) {
      video = url.searchParams.get("v") ?? (url.pathname.match(/^\/(?:embed|shorts)\/([^/?]+)/)?.[1] ?? null);
    }
    return video ? `https://www.youtube-nocookie.com/embed/${encodeURIComponent(video)}` : url.href;
  } catch {
    return undefined;
  }
}
