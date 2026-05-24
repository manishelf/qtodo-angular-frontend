import {
  Component,
  ElementRef,
  HostListener,
  Input,
  OnChanges,
  QueryList,
  ViewChildren,
} from '@angular/core';
import {
  FormArray,
  FormBuilder,
  FormControl,
  FormGroup,
  FormsModule,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import {
  FormSchema,
  FormField,
  FormFieldValidation,
} from '../../models/FormSchema';
import { CommonModule } from '@angular/common';
import { inputTagTypes } from './../../models/FormSchema';
import { CanvasComponent } from './canvas/canvas.component';
import { ConnectionService } from './../../service/connection/connection.service';
import { DomSanitizer, SafeHtml, SafeResourceUrl } from '@angular/platform-browser';


@Component({
  selector: 'app-user-form',
  imports: [CommonModule, FormsModule, ReactiveFormsModule, CanvasComponent],
  templateUrl: './user-form.component.html',
  styleUrl: './user-form.component.css',
})
export class UserFormComponent implements OnChanges {
  inputTagTypes: (string | undefined)[];

  @Input() schema: FormSchema | undefined;
  schemaInternal: FormSchema | undefined;
  @Input() data: any;

  isValid: boolean = false;

  fabricjsLoaded: boolean = false;

  @ViewChildren(CanvasComponent) canvasComponents!: QueryList<CanvasComponent>;

  fileControlsId: string[] = [];
  
  iframeControlId: string[] = [];
  
  constructor(private formBuilder: FormBuilder, private connectionService: ConnectionService, private sanitizer: DomSanitizer) {
    this.inputTagTypes = inputTagTypes;
   }

  async state(): Promise<Map<string, any>> {
    if (!this.schemaInternal?.fields) return new Map();

    if (this.dynamicForm?.valid) {
      let data = this.dynamicForm.value;
      let canvasArr = this.canvasComponents.toArray(); 

      for(let canvas of canvasArr){
        data[canvas.id]=canvas.getState();       
      }

      if(this.fileControlsId.length>0){
        console.log(1);
        
        await new Promise((res,rej)=>{
          for(let fileId of this.fileControlsId){
            let ele = document.getElementById(fileId);
            let file = (ele as any)?.files[0];
            if (file) {
                const reader = new FileReader();

                reader.onload = function(e) {
                  const dataUrl = e.target?.result;
                  data[fileId]=dataUrl;
                  res(data);
                };
                
                reader.readAsDataURL(file);
            }else{
              res(data);
            }
          }
        });
      }

      if(this.iframeControlId.length>0){
        //safeResourceUrl - {changingThisBreaksApplicationSecurity:dataUrl}
        this.iframeControlId.forEach((id)=>{
          data[id] = data[id].changingThisBreaksApplicationSecurity;
        });
      }
      
      return new Promise((res)=>res(data));
    } else {
      let errors = new Map();
      for (let i = 0; i < this.schemaInternal.fields.length; i++) {
        let control = this.dynamicForm?.get(this.schemaInternal.fields[i].name);
        if (control) {
          errors.set(this.schemaInternal.fields[i].name, control.errors);
        }
      }
      return errors;
    }
  }

  dynamicForm!: FormGroup;


  ngOnChanges(): void {
    this.schemaInternal = structuredClone(this.schema);
    if (this.data) {
      let data = new Map(Object.entries(this.data));
      if(this.schemaInternal){
        this.schemaInternal?.fields?.forEach((field) => {
          field.default = data.get(field.name) as string;
          let isFile= field.type == 'image' || field.type == 'file' || field.type == 'iframe';

          if( isFile && (typeof field.default) == "string" && field.default?.startsWith('/item/doc/')){
           this.connectionService.getUrlWithToken(field.default).then(url=>{
            (field.default as any) = this.getSafeLinkHtmlForIframe(url);
            this.createForm();
           });
          }
          
          if(field.type == 'iframe'){
            this.iframeControlId.push(field.name);
            (field.default as any)= this.getSafeLinkHtmlForIframe(field.default);
          }
        });
      }
    }
    this.createForm();
  }

  @HostListener('focusin', ['$event'])
  onControlFocusIn(event: Event) {
    let target: HTMLElement = event.target as HTMLElement;
    target?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  createForm(): void {
    const formControls: { [key: string]: FormControl | FormArray } = {};
    if (this.schemaInternal && this.schemaInternal.fields) {
      for (let i = 0; i < this.schemaInternal.fields.length; i++) {
        const validators = [];
        const field: FormField = this.schemaInternal.fields[i];
        const type = field.type;
        const {
          require,
          readonly,
          maxLength,
          minLength,
          min,
          max,
          pattern,
        }: FormFieldValidation = { ...field.validation };
        const fieldName: string = field.name;
        if (require) {
          validators.push(Validators.required);
        }
        if (maxLength) {
          validators.push(Validators.maxLength(maxLength));
        }
        if (minLength) {
          validators.push(Validators.minLength(minLength));
        }
        if (pattern && type !== 'url') {
          validators.push(Validators.pattern(pattern));
        }
        if (max) {
          validators.push(Validators.max(Number.parseInt(max)));
        }
        if (min) {
          validators.push(Validators.min(Number.parseInt(min)));
        }
        if (type === 'email') {
          validators.push(Validators.email);
        }
        if (type === 'timestamp') {
          if (!field.default) {
            field.default = '';
          }
          field.default +=
            (field.default === '') ? '' : ' ,\n ' +
            Intl.DateTimeFormat([], {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            }).format(new Date());
        }
        if (type === 'history') {
          if (!field.default) {
            field.default = '';
          }
          field.default += JSON.stringify({
            timestamp: Date(),
            subject: JSON.stringify(
              (
                document.getElementById(
                  'editor-subject-input'
                ) as HTMLInputElement
              )?.value
            ),
            description: JSON.stringify(
              (
                document.getElementById(
                  'editor-description-input'
                ) as HTMLTextAreaElement
              )?.value
            ),
            formData: JSON.stringify(this.data),
          });
        }
        
        if(type === 'canvas'){
          continue; // dont add as a form 
        }

        if(type === 'file'){
          this.fileControlsId.push(field.name);
        }

        if (type === 'checkbox' && field.options) {
          let checkboxCtrls = field.options.split(',').map((option, i) => {
            const checked = (field.default || [false]).at(i);
            return this.formBuilder.control(checked);
          });
          formControls[fieldName] = this.formBuilder.array(checkboxCtrls);
        } else {
          formControls[fieldName] = this.formBuilder.control(
            field.default,
            validators
          );
        }
      }
    }
    this.dynamicForm = this.formBuilder.group(formControls);
  }

  filterDuplicateFields() {
    if (!this.schemaInternal || !this.schemaInternal.fields) return;
    this.schemaInternal.fields;
    let uniqueFields = new Map<string, FormField>();
    for (const f of this.schemaInternal.fields) {
      uniqueFields.set(f.name, f);
    }
    this.schemaInternal.fields = Array.from(uniqueFields.values());
  }

  openFileBrowserFor(id: string){
    document.getElementById(id)?.click();
  }

  getSafeLinkHtmlForIframe(data: string): SafeResourceUrl{
    return this.sanitizer.bypassSecurityTrustResourceUrl(data);
  }
}
