import assert from "node:assert/strict";
import { test } from "node:test";
import { urlDoEmbed } from "./embed.ts";

test("normaliza links comuns do YouTube para player sem cookies", () => {
  assert.equal(urlDoEmbed("https://www.youtube.com/watch?v=abc_123"), "https://www.youtube-nocookie.com/embed/abc_123");
  assert.equal(urlDoEmbed("https://youtu.be/abc_123?t=20"), "https://www.youtube-nocookie.com/embed/abc_123");
  assert.equal(urlDoEmbed("https://m.youtube.com/shorts/abc_123"), "https://www.youtube-nocookie.com/embed/abc_123");
});

test("aceita somente URLs HTTPS incorporáveis", () => {
  assert.equal(urlDoEmbed("https://exemplo.com/pagina"), "https://exemplo.com/pagina");
  assert.equal(urlDoEmbed("http://exemplo.com"), undefined);
  assert.equal(urlDoEmbed("javascript:alert(1)"), undefined);
});
