
export const collapsibleBlock: any = {
    name: 'collapsibleBlock',
    level: 'block',
    start(src:any) {
        return src.match(/\[collapse-(b|i):/)?.index;
    },
    tokenizer(src:any, tokens:any) {
    // Regex to capture: [collapse: HEADER] \n CONTENT \n [/collapse]
    // The 's' flag is crucial for '.' to match newlines
    const rule = /^\[collapse(-(?:b|i))?:(.+?)\]([\s\S]*?)\[\/collapse\]/;
    const match = rule.exec(src);
    if (match) {
        const token = {
            type: 'collapsibleBlock',
            raw: match[0],
            inline: match[1] == '-i',
            header: match[2].trim(),
            text: match[3].trim(),
            tokens: [],
        };
        // as block-level Markdown. This generates tokens for paragraphs, lists, etc.
        (this as any).lexer.blockTokens(token.text, token.tokens);

        return token;
    }
    return undefined;
    },
    renderer(token:any) {
    // 2. Define the custom block renderer
    const contentHtml = (this as any).parser.parse(token.tokens).trim();

    return `<details class="option markdown-collapse-block" style="display:${token.inline?'inline-block':'block'}" >
                <summary class="option markdown-collapse-summary">${token.header}</summary>
                <div class="option markdown-collapse-content">
                    ${contentHtml}
                </div>
            </details>`;
    }
};

/**
 * @media[A simple placeholder image](https://placehold.co/400x200){type:image}
 * @media[Product Demo Clip](https://example.com/videos/demo.mp4){type:video}
 * @media[Background Music Track](https://example.com/audio/bgsound.mp3){type:audio}
 * @media[Background Music Track](https://example.com/pdf/){type:any}
 * @media[My Resizable Image](https://placehold.co/400x200){type:image, width:300px, height:150px}
 * @media[Another Image, Default Size](https://placehold.co/600x300){type:image}
 * @media[Resizable Video Demo](https://www.w3schools.com/html/mov_bbb.mp4){type:video, width:640px, height:360px}
 * @media[Audio Track](https://www.w3schools.com/html/horse.mp3){type:audio, width:100%}
 */
export const mediaEmbedExtension = {
    name: 'mediaEmbedExtension',
    level: 'inline',

    start(src:any) {
        return src.match(/@(media|m)\[/)?.index;
    },

    tokenizer(src:any, tokens:any) {
        // Regex Explanation:
        // ^@(media|m)\[([^\]]+)\]                  -> @media[1: Title/Alt Text] (capturing anything inside the brackets)
        // \(([^)]+)\)                          -> (2: URL) (capturing anything inside the parentheses)
        // \{type:(img|image|vid|video|aud|audio|ifr|iframe|fl|file|any) -> {type:3: mediaType (matching various media types, including shorthand versions like "img" for "image")
        // (?:,\s*(wth|width|wd):(\d+(?:px|%)?))? -> (Optional: 4: width value, e.g., 500px, 100%) (matches width with shorthands "wth", "width", or "w")
        // (?:,\s*(ht|height|h):(\d+(?:px|%)?))?  -> (Optional: 5: height value, e.g., 300px, 50%) (matches height with shorthands "ht", "height", or "h")
        // \}                                    -> closing brace, marking the end of the media query
        const rule = /^@(media|m)\[([^\]]+)\]\(([^)]+)\)\{(type|t):(img|image|vid|video|aud|audio|ifr|iframe|fl|file|any|[^,}]+)(?:,\s*(wth|width|w):(\d+(?:px|%)?))?(?:,\s*(ht|height|h):(\d+(?:px|%)?))?\}/;

        const match = rule.exec(src);

        if (match) {
            const token = {
                type: 'mediaEmbedExtension',
                raw: match[0],
                title: match[2],
                url: match[3],
                mediaType: match[5],
                width: match[7] || null,  // Capture width, if provided
                height: match[9] || null  // Capture height, if provided
            };
            return token;
        }
        return undefined;
    },

    renderer(token:any) {
        let { mediaType, url, title, width, height } = token;
        let output = '';

        // Build style attribute for the wrapper (initial size)
        let styleAttr = '';
        if (width || height) {
            if (width) styleAttr += `width:${width};`;
            if (height) styleAttr += `height:${height};`;
        }
        const refRule = /#Ref:([^\)]+)/;
        const match = refRule.exec(url);
        if(match){
            title = match[0];
            const suffixes = ['', '_URL','_IMG','_FILE_URL_LINK','_IFRAME'];
            for(let suffix of suffixes){
                let ele = document.getElementById(match[1]+suffix);
                if(ele){
                    url = ele.getAttribute('src');
                    if(suffix == '_IMG'){
                        mediaType='image';
                    }
                    if(!url){
                        url = ele.getAttribute('href');
                    }
                    break;
                }
            }
        }

        let mediaHtml = '';

        switch (mediaType) {
            case 'img':
            case 'image':
                mediaHtml = `<img src="${url}" alt="${title}" class="markdown-media-image" loading="lazy" />`;
                break;

            case 'vid':
            case 'video':
                mediaHtml = `
                    <video src="${url}" title="${title}" controls class="markdown-media-video" preload="metadata">
                        Your browser does not support the video tag. Please check "${title}".
                    </video>
                `;
                break;

            case 'aud':
            case 'audio':
                // Audio elements are wrapped for consistency, but the resize handles
                // may not be visually useful for this media type.
                mediaHtml = `
                    <audio src="${url}" title="${title}" controls class="markdown-media-audio" preload="metadata">
                        Your browser does not support the audio element. Please check "${title}".
                    </audio>
                `;
                break;

            default:
                mediaHtml = `<iframe src=${url} class="markdown-media-any" id="iframe_${title}"></iframe>`;
        }

        // Wrap the media element in the resizable container
        output += `<div class="markdown-media-wrapper option" style="${styleAttr}" data-type="${mediaType}" title="${title}">
                        <a href=${url} target="_blank">
                        ${title}↗️
                        </a>
                    ${mediaHtml}
                    </div>`;

        return output;
    }
};



export const treeviewExtension: any = {
  name: 'treeviewExtension',
  level: 'block',

  start(src: any) {
    return src.match(/\[|\!\[/)?.index;
  },

  tokenizer(src: any) {
    const rule = /^\[tree:\s*([^\]]+)\s*\]([\s\S]*?)\[\/tree]/;

    const match = rule.exec(src);
    if (match) {
        const token :any = {
            type: 'treeviewExtension',
            raw: match[0],
            title: match[1].trim(),
            text: match[2].trim(),
            tokens: [],
        };
        // as block-level Markdown. This generates tokens for paragraphs, lists, etc.
        (this as any).lexer.blockTokens(token.text, token.tokens);
        return token;
    }
    return undefined;
  },

  renderer(token: any) {
    let result = token.raw;
    if (token.type === 'treeviewExtension') {
      result = '<pre> \n' + result;
      token.tokens.forEach((token: any)=>{
        token.tokens.forEach((token: any)=>{
          if(token.type == 'link'){
            let relative = token.href.startsWith('./');
            let paramsOnly = token.href.startsWith('./?') || token.href.startsWith('?');;
            // Use URLSearchParams to parse the query string
            const url = paramsOnly ? new URL(token.href, window.location.href) : new URL(token.href, window.location.origin);
            const path = url.pathname;
            const params = Object.fromEntries(url.searchParams.entries());
            const jsonString = JSON.stringify(params).replace(/"/g, '&quot;');

            const clickHandler = (relative || paramsOnly)
                                        ? `onclick="event.preventDefault();
                                                    window.angularRouter.navigate(${paramsOnly?'[]':`[${url}]`},{queryParams:${jsonString}});
                                                   "`
                                        : '';
            let anchor = `<a href="${token.href}" ${clickHandler} class="option">${token.text}</a>`;
            result = result.replace(token.raw, anchor);
          }
        })
      });
      result = result.replace(/\[tree:\s*([^\]]+)\s*\]/, token.title);
      result = result.replace(/\[\/tree\]/g, '');
      result = result + '</pre>'
    }
    
    return result;
  }
};


/// https://github.com/UziTech/marked-katex-extension

declare var katex: any;

const inlineRule = /^(\${1,2})(?!\$)((?:\\.|[^\\\n])*?(?:\\.|[^\\\n\$]))\1(?=[\s?!\.,:？！。，：]|$)/;
const inlineRuleNonStandard = /^(\${1,2})(?!\$)((?:\\.|[^\\\n])*?(?:\\.|[^\\\n\$]))\1/; // Non-standard, even if there are no spaces before and after $ or $$, try to parse

const blockRule = /^(\${1,2})\n((?:\\[^]|[^\\])+?)\n\1(?:\n|$)/;

export const katexExtension = (options = {}) => {
  return {
    extensions: [
      inlineKatex(options, createRenderer(options, false)),
      blockKatex(options, createRenderer(options, true)),
    ],
  };
}

function createRenderer(options: any, newlineAfter: boolean) {
  return (token: any) => katex.renderToString(token.text, { ...options, displayMode: token.displayMode }) + (newlineAfter ? '\n' : '');
}

function inlineKatex(options: any, renderer: any) {
  const nonStandard = options && options.nonStandard;
  const ruleReg = nonStandard ? inlineRuleNonStandard : inlineRule;
  return {
    name: 'inlineKatex',
    level: 'inline',
    start(src: string) {
      let index;
      let indexSrc = src;

      while (indexSrc) {
        index = indexSrc.indexOf('$');
        if (index === -1) {
          return null;
        }
        const f = nonStandard ? index > -1 : index === 0 || indexSrc.charAt(index - 1) === ' ';
        if (f) {
          const possibleKatex = indexSrc.substring(index);

          if (possibleKatex.match(ruleReg)) {
            return index;
          }
        }

        indexSrc = indexSrc.substring(index + 1).replace(/^\$+/, '');
      }
      return null;
    },
    tokenizer(src:string , tokens: any) {
      const match = src.match(ruleReg);
      if (match) {
        return {
          type: 'inlineKatex',
          raw: match[0],
          text: match[2].trim(),
          displayMode: match[1].length === 2,
        };
      }
      return null;
    },
    renderer,
  };
}

function blockKatex(options: any, renderer: any) {
  return {
    name: 'blockKatex',
    level: 'block',
    tokenizer(src: string, tokens: any) {
      const match = src.match(blockRule);
      if (match) {
        return {
          type: 'blockKatex',
          raw: match[0],
          text: match[2].trim(),
          displayMode: match[1].length === 2,
        };
      }
      return null;
    },
    renderer,
  };
}

////