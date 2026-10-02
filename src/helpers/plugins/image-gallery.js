// --- Image Gallery renderer -----------------------------------------------
// Renders ```img-gallery ... ``` fenced code blocks as a lightgallery-powered
// image grid, supporting both vault-local images (path:) and external URLs
// (urls:), matching the behaviour of the obsidian-image-gallery plugin.
//
// Este arquivo só EXPORTA a função renderImageGallery. Quem chama ela é o
// fence rule do markdown-it dentro do .eleventy.js, porque esse fence rule
// também cuida de outros blocos (mermaid, transclusion, gist, callouts) e
// não dá pra separar isso sem duplicar aquela lógica toda.

const fs = require("fs");
const path = require("path");
const matter = require("gray-matter");

// NOTE: __dirname aqui é src/helpers/plugins/, por isso sobe dois níveis
// ("..", "..") até chegar em src/, e desce em site/img/user.
const USER_IMG_DIR = path.join(__dirname, "..", "..", "site", "img", "user");

const IMG_VALID_EXTS = ['jpeg','jpg','gif','png','webp','tiff','tif','svg','bmp','avif'];
let galleryCounter = 0;

function collectImagesFromVaultDir(dir, baseDir) {
  const results = [];
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return results; }
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectImagesFromVaultDir(fullPath, baseDir));
    } else {
      const ext = path.extname(entry.name).slice(1).toLowerCase();
      if (IMG_VALID_EXTS.includes(ext)) {
        const relPath = path.relative(baseDir, fullPath);
        const urlPath = '/img/user/' + relPath.split(path.sep).map(s => encodeURIComponent(s)).join('/');
        let mtime = 0, ctime = 0;
        try { const st = fs.statSync(fullPath); mtime = st.mtimeMs; ctime = st.ctimeMs; } catch {}
        results.push({ src: urlPath, name: entry.name, mtime, ctime });
      }
    }
  }
  return results;
}

function resolveGalleryImages(settings) {
  let images = [];

  if (settings.path) {
    const cleanPath = settings.path.replace(/\\/g, '/').replace(/^\//, '');
    const dirPath = path.join(USER_IMG_DIR, cleanPath);
    const vaultImages = collectImagesFromVaultDir(dirPath, USER_IMG_DIR);

    const sortby = settings.sortby || 'name';
    const sort   = settings.sort   || 'asc';
    vaultImages.sort((a, b) => {
      const va = sortby === 'name' ? a.name.toUpperCase() : (sortby === 'mtime' ? a.mtime : a.ctime);
      const vb = sortby === 'name' ? b.name.toUpperCase() : (sortby === 'mtime' ? b.mtime : b.ctime);
      return va < vb ? -1 : va > vb ? 1 : 0;
    });
    if (sort === 'desc') vaultImages.reverse();
    images = images.concat(vaultImages);
  }

  if (settings.urls) {
    const rawUrls = Array.isArray(settings.urls) ? settings.urls : [settings.urls];
    for (const url of rawUrls) {
      if (url && typeof url === 'string' && url.trim()) {
        const trimmed = url.trim();
        images.push({ src: trimmed, name: trimmed.split('/').pop().split('?')[0] });
      }
    }
  }

  return images;
}

function renderImageGallery(content) {
  // Parse the YAML block using gray-matter (already a dependency in this project)
  let settings = {};
  try {
    settings = matter('---\n' + content.trim() + '\n---').data || {};
  } catch(e) {
    return `<div class="dg-gallery-error">⚠️ Image Gallery: invalid YAML — ${e.message}</div>`;
  }

  if (!settings.path && !settings.urls) {
    return `<div class="dg-gallery-error">⚠️ Image Gallery: please specify a <code>path</code> or <code>urls</code>.</div>`;
  }

  const images = resolveGalleryImages(settings);
  if (images.length === 0) {
    return `<div class="dg-gallery-error">⚠️ Image Gallery: no images found. Check your <code>path</code> or <code>urls</code>.</div>`;
  }

  const type    = settings.type    || 'horizontal';
  const columns = settings.columns || 3;
  const height  = settings.height  || 260;
  const gutter  = settings.gutter  !== undefined ? settings.gutter : 8;
  const radius  = settings.radius  !== undefined ? settings.radius : 0;
  const mobile  = settings.mobile  || 1;
  const id      = `dg-gallery-${++galleryCounter}`;

  const items = images.map(img =>
    `  <a href="${img.src}" class="dg-gallery-item">` +
    `<img src="${img.src}" alt="${img.name}" loading="lazy"></a>`
  ).join('\n');

  // Lightgallery assets are loaded once per page via a runtime guard
  const lgVersion = '2.7.2';
  const lgBase    = `https://cdnjs.cloudflare.com/ajax/libs/lightgallery/${lgVersion}`;

  return `<div id="${id}" class="dg-image-gallery dg-gallery-${type}" style="--dg-cols:${columns};--dg-gap:${gutter}px;--dg-r:${radius}px;--dg-cols-mobile:${mobile}">
${items}
</div>
<script>
(function(){
  // Load lightgallery assets only once per page
  if (!document.getElementById('__dg-lg-assets')) {
    var m = document.createElement('div'); m.id='__dg-lg-assets'; m.style.display='none';
    document.body.appendChild(m);
    ['${lgBase}/css/lightgallery.min.css','${lgBase}/css/lg-thumbnail.min.css'].forEach(function(h){
      var l=document.createElement('link'); l.rel='stylesheet'; l.href=h; document.head.appendChild(l);
    });
    var s1 = document.createElement('script'); s1.src='${lgBase}/lightgallery.min.js';
    s1.onload = function(){
      var s2 = document.createElement('script'); s2.src='${lgBase}/plugins/thumbnail/lg-thumbnail.min.js';
      s2.onload = function(){ window.__lgReady=true; document.dispatchEvent(new Event('lgReady')); };
      document.head.appendChild(s2);
    };
    document.head.appendChild(s1);
  }
  function initLg() {
    lightGallery(document.getElementById('${id}'), {
      plugins: typeof lgThumbnail !== 'undefined' ? [lgThumbnail] : [],
      thumbnail: true, animateThumb: true, showThumbByDefault: false, speed: 300,
    });
  }
  function initLgWhenReady() {
    if (window.__lgReady) { initLg(); }
    else { document.addEventListener('lgReady', initLg, {once:true}); }
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initLgWhenReady);
  } else {
    initLgWhenReady();
  }
})();
</script>`;
}
// --------------------------------------------------------------------------

// --- Integração com o markdown-it -------------------------------------
// .eleventy.js já define uma regra de fence (```) pra mermaid, gist,
// transclusion e callouts. userMarkdownSetup (em userSetup.js) roda DEPOIS
// dessa regra ser definida (o .eleventy.js chama .use(userMarkdownSetup)
// por último), então aqui a gente guarda a regra que já existe e
// "embrulha" ela: se o bloco for ```img-gallery, a gente trata; qualquer
// outro tipo, repassa pra regra original. Assim não precisamos editar o
// .eleventy.js.
function setupImageGallery(md) {
  const existingFenceRule = md.renderer.rules.fence;
  md.renderer.rules.fence = (tokens, idx, options, env, slf) => {
    const token = tokens[idx];
    if (token.info.trim() === "img-gallery") {
      return renderImageGallery(token.content);
    }
    return existingFenceRule(tokens, idx, options, env, slf);
  };
}
// --------------------------------------------------------------------------

module.exports = { renderImageGallery, setupImageGallery };