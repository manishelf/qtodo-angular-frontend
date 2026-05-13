import { Injectable } from '@angular/core';
import { marked } from 'marked';
import { collapsibleBlock, mediaEmbedExtension, treeviewExtension , katexExtension} from './customExtensions';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';

declare var Prism : any;

@Injectable({
  providedIn: 'root'
})
export class MarkdownService {

  constructor(private domSanitizer: DomSanitizer) {
    marked.use({
      extensions: [collapsibleBlock, mediaEmbedExtension, treeviewExtension],
      gfm: true,
    });
    marked.use(katexExtension({throwOnError: false}));
   }

   parse(input:string):Promise<SafeHtml> {
    return new Promise((res, rej)=>{
      input = this.formatCode(input); 
      marked.parse(input, {async: true}).then((result)=>{
     
      res(this.domSanitizer.bypassSecurityTrustHtml(result));
        requestAnimationFrame(() => {
          if(!Prism.manual){
            // make highlighting async
            Prism.manual = true;
          }
          Prism.highlightAll(true);
        });
      });
    });
   }

   formatCode(result: string){
      let code =
        result.match(/<code class="language-(\w+)">([\s\S]*?)<\/code>/g) ||
        result.match(/<code>([\s\S]*?)<\/code>/);

      if (code) {
          for (let i = 0; i < code.length; i++) {
          let snippet = code[i];
          result = result.replace(snippet, snippet.replace(/<br>/g, '\n'));
        }

      }
      return result;
   }

}
