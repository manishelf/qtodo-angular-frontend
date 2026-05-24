import {
  AfterViewChecked,
  AfterViewInit,
  Component,
  ElementRef,
  EventEmitter,
  HostListener,
  Input,
  Output,
  OnChanges,
  OnDestroy,
  OnInit,
  ViewChild,
} from '@angular/core';
import { FormControl, FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { BeanItemComponent } from '../../component/bean-item/bean-item.component';
import { TodoServiceService } from '../../service/todo/todo-service.service';
import { TodoItem } from '../../models/todo-item';
import { ActivatedRoute, NavigationEnd, Router, TitleStrategy } from '@angular/router';
import { Tag } from '../../models/tag';
import { UserDefinedType } from '../../models/userdefined-type';
import {
  DomSanitizer,
  SafeHtml,
  SafeResourceUrl,
} from '@angular/platform-browser';
import { UserFormComponent } from '../../component/user-form/user-form.component';
import { FormField, FormSchema, inputTagTypes } from '../../models/FormSchema';
import { ToastService } from 'angular-toastify';
import { TagListComponent } from '../../component/tag-list/tag-list.component';
import{v4 as uuidv4} from 'uuid';
import { UserService } from '../../service/user/user.service';
import { Subscription, delay, Observable } from 'rxjs';
import { localUser } from '../../service/consts';
import { MarkdownService } from '../../service/markdown/markdown.service';
import { ChangeDetectorRef } from '@angular/core';

@Component({
  selector: 'app-editor',
  templateUrl: './editor.component.html',
  styleUrls: ['./editor.component.css'],
  imports: [FormsModule, CommonModule, MatIconModule, UserFormComponent, TagListComponent],
})
export class EditorComponent implements AfterViewChecked, OnInit, AfterViewInit, OnDestroy {

  @Input('inCompoundView') inCompoundView: boolean = false;
  @Input('compoundViewActiveItem') compoundViewActiveItem$: Observable<TodoItem|null> | null = null;

  @Output('saved') itemSavedEvent = new EventEmitter<boolean>();

  @ViewChild('editorContainer') editorContainer!: ElementRef;
  @ViewChild('subjectTxt') subjectTxt!: ElementRef;
  @ViewChild('descriptionArea') descriptionArea!: ElementRef;
  @ViewChild('lineNumbers') lineNumbers!: ElementRef;
  @ViewChild('userForm') userForm!: UserFormComponent;
  @ViewChild('tagInputArea') tagInputArea!: ElementRef;


  queryParams = {};

  convertedMarkdown: SafeHtml = '';
  option: string = 'Preview';
  forEdit: number = -1;
  showTags: boolean = false;
  schemaEditingInProgress: boolean = false;
  customFormSchema: FormSchema | undefined;
  customFormData: any;
  editiorLinesLoaded: boolean = false;

  @Input() navigateBackOnSave = false;

  leftIndentSpcaeCount: number = 0;

  ownedByCurrentUser: boolean = false;

  owningUsersEmail: string = '';
  owningUsersAlias: string = '';

  userSubscription!: Subscription;
  compoundViewActiveItemSubscription!: Subscription;

  todoItem: Omit<TodoItem, 'id'> = {
    subject: '',
    uuid: uuidv4(),
    description: '',
    version:0,
    tags: [{ name: '*' }], //if no tag is added for a item then search by tags does not work correctly
    completionStatus: false,
    setForReminder: false,
    creationTimestamp: new Date(Date.now()).toISOString(),
    updationTimestamp: new Date(Date.now()).toISOString(),
    owningUser: localUser
  };

  constructor(
    private todoService: TodoServiceService,
    private router: Router,
    private toaster: ToastService,
    private route: ActivatedRoute,
    private userService: UserService,
    private markdownService: MarkdownService,
    private cdr: ChangeDetectorRef,
  ) {
    const navigation = this.router.getCurrentNavigation();

    this.route.queryParams.pipe(delay(100)).subscribe((params)=>{
        let id = params['id'];
        let subject = params['subject'];
        id = Number.parseInt(id);
        let noData = false;
        
        if(this.router.url.startsWith('/create') && (id || subject)){
          this.router.navigate(['./create']);
          return;
        }
        setTimeout(()=>{ // EWW , allow index db to initialize
          if(id){
            this.todoService.getItemById(id).subscribe((item)=>{
              if(item){
                this.forEdit = id;
                this.todoItem = item;
                this.refresh();
                this.updateOwningUser();
                noData = false;
              }
            });
          }else if(subject){
            this.todoService.searchTodos(subject).subscribe((item)=>{
              if(item){
                this.forEdit = item[0].id;
                this.todoItem = item[0];
                this.refresh();
                this.updateOwningUser();
                noData = false;
              }
            });
          }
          else {
            noData = true;
          }
        }, 100);

        if (navigation?.extras?.state) {
          let itemForUpdate = navigation.extras.state['item'] as TodoItem;
          this.queryParams = navigation.extras.state['query'];
          this.forEdit = itemForUpdate.id;
          this.todoItem = itemForUpdate;
          this.todoItem.description = this.todoItem.description.replace(
            /<br>/g,
            '\n'
          );
          this.customFormSchema = this.todoItem.userDefined?.formControlSchema;
          this.customFormData = this.todoItem.userDefined?.data;
          this.updateOwningUser();
          this.onEventForResize();
          noData = false;
        }

        if(noData && !this.router.url.startsWith('/create') && !this.router.url.startsWith('/comp')){
          this.router.navigate(['/']);
        }
    });

    this.userSubscription = this.userService.loggedInUser$.subscribe((user)=>{
      if(this.todoItem.owningUser == localUser && user != localUser)
        this.todoItem.owningUser = user;
    });
  }

  ngOnInit(): void{
    if(this.inCompoundView && this.compoundViewActiveItem$){
      this.compoundViewActiveItemSubscription =  this.compoundViewActiveItem$.subscribe((item: TodoItem | null)=>{
        if(item){
          this.todoItem = item;
          this.forEdit = item.id;
          this.option = 'Preview';
          this.onOptionClick();
          this.refresh();
        }
      });
    }
  }

  ngAfterViewInit(): void {
    setTimeout(()=>{
      this.subjectTxt.nativeElement.scrollIntoView();
      if(!this.inCompoundView){
        this.subjectTxt.nativeElement.focus();
      }
    },100);
    requestAnimationFrame(()=>{this.onEventForResize();});
    this.convertedMarkdown = '';
    //this.navigateBackOnSave = true;
  }

  refresh() {
    if(this.option == 'Editor'){
      this.markdownService.parse(this.todoItem.description).then((markdown)=>{
        this.convertedMarkdown = markdown;
      });
    }
    this.cdr.detectChanges();
  }

  updateOwningUser(): void {
    if(!this.todoItem.owningUser) return;

    this.owningUsersAlias = this.todoItem.owningUser.alias || this.todoItem.owningUser.email;
    this.owningUsersEmail = this.todoItem.owningUser.email;

    this.ownedByCurrentUser = this.userService.isThisCurrentUser(this.todoItem.owningUser) && this.owningUsersAlias != '';
  }

  ngAfterViewChecked(): void {
    // called each time a child is updated
    // i.e on every letter typed in the textarea so a flag is needed
    // thankyou Phuoc Nguyen https://dev.to/phuocng/display-the-line-numbers-in-a-text-area-46mk
    if (this.editiorLinesLoaded) return;

    const textarea = this.descriptionArea?.nativeElement as HTMLTextAreaElement;
    const lineNumbersEle = this.lineNumbers?.nativeElement as HTMLElement;
    if (!(textarea || lineNumbersEle)) return;

    const textareaStyles = window.getComputedStyle(textarea);
    [
      'fontFamily',
      'fontSize',
      'fontWeight',
      'letterSpacing',
      'lineHeight',
      'padding',
    ].forEach((property: any) => {
      lineNumbersEle.style[property] = textareaStyles[property];
    });

    const parseValue = (v: any) =>
      v.endsWith('px') ? parseInt(v.slice(0, -2), 10) : 0;

    const font = `${textareaStyles.fontSize} ${textareaStyles.fontFamily}`;
    const paddingLeft = parseValue(textareaStyles.paddingLeft);
    const paddingRight = parseValue(textareaStyles.paddingRight);

    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (context) context.font = font;

    const calculateNumLines = (str: string) => {
      const textareaWidth =
        textarea.getBoundingClientRect().width - paddingLeft - paddingRight;
      const words = str.split(' ');
      let lineCount = 0;
      let currentLine = '';
      for (let i = 0; i < words.length; i++) {
        const wordWidth = context?.measureText(words[i] + ' ').width || 0;
        const lineWidth = context?.measureText(currentLine).width || 0;

        if (lineWidth + wordWidth > textareaWidth) {
          lineCount++;
          currentLine = words[i] + ' ';
        } else {
          currentLine += words[i] + ' ';
        }
      }

      if (currentLine.trim() !== '') {
        lineCount++;
      }

      return lineCount;
    };

    const calculateLineNumbers = () => {
      const lines = textarea.value.split('\n');
      const numLines = lines.map((line) => calculateNumLines(line));

      let lineNumbers = [];
      let i = 1;
      while (numLines.length > 0) {
        const numLinesOfSentence = numLines.shift() || 0;
        lineNumbers.push(i);
        if (numLinesOfSentence > 1) {
          Array(numLinesOfSentence - 1)
            .fill('')
            .forEach((_) => lineNumbers.push(''));
        }
        i++;
      }

      return lineNumbers;
    };

    const displayLineNumbers = () => {
      const lineNumbers = calculateLineNumbers();
      lineNumbersEle.innerHTML = Array.from(
        {
          length: lineNumbers.length,
        },
        (_, i) =>
          `<div style="cursor:pointer"
             onmouseover="this.style.color = 'white'"
             onmouseout="this.style.color = '#39ff13'">
              ${lineNumbers[i] || '&nbsp;'}
            </div>`
      ).join('');
    };

    textarea.addEventListener('input', () => {
      displayLineNumbers();
    });

    displayLineNumbers();

    const ro = new ResizeObserver(() => {
      const rect = textarea.getBoundingClientRect();
      lineNumbersEle.style.height = `${rect.height}px`;
      displayLineNumbers();
    });
    ro.observe(textarea);

    textarea.addEventListener('scroll', () => {
      lineNumbersEle.scrollTop = textarea.scrollTop;
    });

    this.editiorLinesLoaded = true;
  }

  handleKeydownForDescription(event: KeyboardEvent): void {

    const targetTextArea = event.target as HTMLTextAreaElement;
    const start = targetTextArea.selectionStart;
    const end = targetTextArea.selectionEnd;
    const sentenceStart = targetTextArea.value.substring(0,start);
    const sentenceEnd = targetTextArea.value.substring(end);

    if (event.key === 'Tab') {
      event.preventDefault();
      targetTextArea.value = sentenceStart + '\t' + sentenceEnd;
      targetTextArea.selectionStart = targetTextArea.selectionEnd = start + 1;

      if(sentenceStart.length == 0 || sentenceStart.match(/\n\t*$/)){ // zero or more tabs after nl
        this.leftIndentSpcaeCount+=1;
      }
      this.todoItem.description = targetTextArea.value;
    } else if (event.key === 'Enter') {
      if(this.leftIndentSpcaeCount>0 && sentenceStart.match(/\n*\t*$/)){ // zero or more tabs after nl
        event.preventDefault();
        targetTextArea.value=sentenceStart+'\n';
        for(let i = 0; i<this.leftIndentSpcaeCount; i++){
          targetTextArea.value+='\t';
        }
        targetTextArea.value+=sentenceEnd;
        targetTextArea.selectionStart = targetTextArea.selectionEnd = start + 1 + this.leftIndentSpcaeCount;
        this.todoItem.description = targetTextArea.value;
      }else{
        // alow natural line breaking and reset indentation
        this.leftIndentSpcaeCount = 0;
      }
      this.onEventForResize();
    }else if (event.key === 'Backspace'){
      const target = event.target as HTMLTextAreaElement;
      const start = target.selectionStart;
      const sentenceStart = target.value.substring(0,start);
      if(sentenceStart.match(/\n\t+$/)){ // one or more tabs after nl
        this.leftIndentSpcaeCount-=1;
        if(this.leftIndentSpcaeCount<0) this.leftIndentSpcaeCount = 0;
      }
      this.onEventForResize();
    }
     else if (event.key === 's' && event.ctrlKey) {
      event.preventDefault();
      this.onAddClick();
    } else if(event.key ==='[' && event.ctrlKey) {
      this.addChildItem();
    } else if(event.key === ']' && event.ctrlKey) {
      this.navigateToParent();
    }

  }

  handleKeydownForSubject(event: KeyboardEvent){
    if (event.key === 'Enter') {
      event.preventDefault();
      this.onAddClick();
    }
  }

  addChildItem():void {
    let {id, ...childItem} = structuredClone((this.todoItem as any)); // clone the parent; it can contain id from save
    let name = `child of ${this.todoItem.subject}`;
    childItem.subject = '';
    childItem.description = '### ['+name+']';
    childItem.userDefined = undefined;
    childItem.tags.push({name});
    childItem.uuid = '';

    let toggleNavOnSave = this.navigateBackOnSave;
    if(toggleNavOnSave)
      this.navigateBackOnSave = false;
    this.onAddClick();
    if(toggleNavOnSave)
      this.navigateBackOnSave = true;

    this.todoService.addItem(childItem).then((id)=>{
      this.itemSavedEvent.emit(true);
      if(this.inCompoundView){
        this.todoItem = {id, ...childItem};
        this.forEdit = id;
      }else{
        this.router.navigate(['./edit/child'],{state:{item:{id: id, ...childItem}, params: this.queryParams}, queryParams:{id}});
      }
    });
  }

  navigateToParent(): void {
    this.todoService.updateItem({id:this.forEdit, ...this.todoItem});
    let parentSubjectMatch = this.todoItem.description.match(/^### \[child of (.+?)\]/);
    this.itemSavedEvent.emit(true);
    if (parentSubjectMatch) {
      this.updateParentDescForTree();
      if(this.inCompoundView){
        this.todoService.searchTodos(parentSubjectMatch[1]).subscribe((itemList: TodoItem[])=>{
          if(itemList && itemList.length > 0){
            this.forEdit = itemList[0].id;
            this.todoItem = itemList[0];
          }
        });
      }else{
        setTimeout(()=>{
          this.router.navigate(['./edit/parent'],{queryParams:{subject: parentSubjectMatch[1]}});
        },1000)
      }
    }
    else if(this.navigateBackOnSave){
       this.router.navigate(['/home'], {queryParams:this.queryParams});
    }
    requestAnimationFrame(()=>{
      this.descriptionArea?.nativeElement.focus();
    });
  }

  createChildTreeview(parentSubject: string, hierarchy: {item:TodoItem, children: Set<TodoItem>}[]): string{

/*
    let tree = '\n[tree: ';
    tree += parentSubject+' ]\n';

    let level = 0;
    let visited = new Set();
    for(let entry of hierarchy){
      visited.add(entry.item.subject)
      let i = 0 ;
      for(let child of entry.children){
        i++;
        if(visited.has(child.subject)){
          continue;
        }

        let icon = '├──';
        if(i == entry.children.size){
          icon = '└──';
        }

        let parentSubject = child.description?.match(/^### \[child of (.+?)\]/);
        if(parentSubject && !visited.has(parentSubject[1])){
          level+=1;
        }else level=0;

        tree += '\t'.repeat((level+1)*2) + icon+' ['+child.subject+'](./edit?id='+child.id+')\n';
      }
    }

    tree+='[/tree]\n';
*/

    const lines: string[] = [];
    const visited = new Set<string>();

    lines.push('');
    lines.push(`[tree: ${parentSubject} ]`);

    for (const entry of hierarchy) {
      visited.add(entry.item.subject);

      const children = Array.from(entry.children);
      children.forEach((child, index) => {
        if (visited.has(child.subject)) return;

        const isLast = index === children.length - 1;
        const icon = isLast ? '└──' : '├──';

        // determine depth from description
        const parentMatch = child.description?.match(/^### \[child of (.+?)\]/);
        const level = parentMatch && !visited.has(parentMatch[1]) ? 1 : 0;

        lines.push(
          `${'\t'.repeat((level) * 2)}${icon} [${child.subject}](?id=${child.id})`
        );

        visited.add(child.subject);
      });
    }

    lines.push('[/tree]');
    lines.push('');

    return lines.join('\n');

  }

  updateParentDescForTree(){
    let parentSubjectMatch = this.todoItem.description.match(/^### \[child of (.+?)\]/);
    if(parentSubjectMatch){
      let replaceDesc = (parent:TodoItem, tree:string)=>{
        let existingTree = parent.description.match(
                           new RegExp(`\\n\\[tree: ${parentSubjectMatch[1]} \\][\\s\\S]*?\\[\\/tree\\]\\n`, 's'));
          if(existingTree){
            parent.description = parent.description.replace(new RegExp(`\\n\\[tree: ${parentSubjectMatch[1]} \\][\\s\\S]*?\\[\\/tree\\]\\n`,'s'), tree);
          }else{
            parent.description += tree;
          }
      }
      let hierarchy = [];
      this.todoService.searchTodos(parentSubjectMatch[1]).subscribe((res)=>{
        let parent = res[0];
        this.todoService.searchTodos('', ['child of '+parentSubjectMatch[1]], [], true).subscribe((children)=>{
          hierarchy.push({item: parent, children: new Set(children)})
          let tree = this.createChildTreeview(parentSubjectMatch[1], hierarchy);
          replaceDesc(parent, tree);
          this.todoService.updateItem(parent);
        });
      });
    }
  }

  onEventForResize(): void {
    if (this.descriptionArea) {
      const descriptionArea = this.descriptionArea.nativeElement;
      descriptionArea.style.height = 'auto';
      requestAnimationFrame(() => { // because setTimeout causes the text to jump up and down
        descriptionArea.style.height = descriptionArea.scrollHeight + 'px';
      });
    }
  }

  @HostListener('paste', ['$event'])
  onPasteEvent(event: Event) {
    if(!(event.target instanceof HTMLTextAreaElement)){
      return;
    }
    const descArea = event.target as HTMLTextAreaElement;

    let clipBoardData = (event as ClipboardEvent).clipboardData;
    let text = clipBoardData?.getData('text');

    if (
      text?.toLocaleLowerCase().startsWith('http://') ||
      text?.toLocaleLowerCase().startsWith('https://')
    ) {
      let cursorPosition = descArea.selectionStart;
      this.todoItem.description =
        this.todoItem.description.substring(0, cursorPosition) +
        `[link_${new Date().getSeconds()}](${text})` +
      this.todoItem.description.substring(cursorPosition);
      event.preventDefault();
      this.onEventForResize();
    }
    interface data {
      file: File;
      reader: FileReader;
    }
    let DecodeItem = new Promise<data>((resolve) => {
      for (let item of clipBoardData?.items || []) {
        if (item.kind.startsWith('file')) {
          let blob = item.getAsFile();
          let file = item.getAsFile();
          if (blob && file) {
            const reader = new FileReader();
            reader.readAsDataURL(blob);
            resolve({ file, reader });
          }
        }
      }
    });

    DecodeItem.then((data) => {
      data.reader.onload = (event: Event) => {
        let target: any = event.target;
        if (target.result) {
          let fileType = data.file.type.replaceAll('/','_');
          let fileName = data.file.name.replaceAll(/[.]/g,'_');
          if(fileName==fileType){
            fileType='SCP';
          }
          fileName = fileType+'_'+fileName+'_'+ data.file.lastModified;
              // new Date(data.file.lastModified).toLocaleString().replaceAll(/[-,\/.: ]/g,'_');
          let field: FormField = {
            type: 'file',
            name: fileName,
            label: data.file.name,
            default: 'file data',
            validation:{
              readonly: true,
            },
          };
          if (data.file.type.startsWith('image')) {
            field.type = 'image';
          }

          this.appendCustomSchemaFields([field]);
          let formData: any = {};
          formData[field.name] = target.result;

          this.customFormData = { ...this.customFormData, ...formData };

          let hasPastedFiles = false;
          for(let t of this.todoItem.tags){
            if(t.name == 'has-attachments'){
              hasPastedFiles = true;
            }
          }

          if(!hasPastedFiles){
            this.todoItem.tags.push({name: 'has-attachments'});
          }

          let fieldType = 'any';
          if(field.type=='image'){
            fieldType='img'
          }

          let fieldRef = ` @m[${field.label}](#Ref:${field.name}){t:${fieldType},w:100px,h:100px} `;

          const cursorPosition = descArea.selectionStart;
          this.todoItem.description =
            this.todoItem.description.substring(0, cursorPosition) +
            fieldRef +
            this.todoItem.description.substring(cursorPosition);

          this.onEventForResize();
        }
      };
    });
    this.onEventForResize();
  }


  onOptionClickOnDelay(event: Event){
    let selection = window.getSelection();
    if(selection && selection.toString().length > 0 || (event.target as HTMLElement).classList.contains('option')) {
        return;
    }

    const editorContainer = this.editorContainer.nativeElement;
    const scrollPercentage = editorContainer.scrollTop / editorContainer.scrollHeight;

    requestAnimationFrame(()=>{
      this.onOptionClick();
      setTimeout(()=>{
        const newScrollTop = editorContainer.scrollHeight * scrollPercentage;
        editorContainer.scrollTop = newScrollTop;
        this.onEventForResize();
      },100); // needs to be timeout instead of requAnimFrame as ther is timing issue otherwise
    });
  }

  onOptionClick() {
    if(this.todoItem.subject === '' && this.todoItem.description === ''){
      return;
    }

    if (this.option == 'Preview') {
      this.editiorLinesLoaded = false;
      this.markdownService.parse(this.todoItem.description).then((markdown)=>{
        this.convertedMarkdown = markdown;
      });
    }else {
      this.onEventForResize();
    }
    this.option = this.option === 'Preview' ? 'Editor' : 'Preview';
  }

  async onAddClick() {
    if(this.todoItem.deleted) {
      if(prompt("item already deleted! do you want to save a copy? (Y|N)") != "Y"){
        return;
      }else{
        this.forEdit = -1;
        let {id, item} = (structuredClone(this.todoItem) as any);
        item.subject += ' (restored-'+Date.now().toLocaleString()+')';
        this.todoItem = item;
        this.todoItem.deleted=false;
      }
    };

    if (this.userForm?.dynamicForm.invalid) {
      console.log('user defined field validation failed - ');
      console.error(this.userForm.state());
      (await this.userForm.state()).forEach((value, key) => {
        if (value) {
          let stringy = JSON.stringify(value);
          this.toaster.error(key + '->' + stringy);
        }
      });
      return;
    }
    if (this.customFormSchema?.fields) {
      this.todoItem.userDefined = {
        tag: {name:this.todoItem.tags.filter((tag) => tag.name.startsWith('form-')).map(tag => tag.name).join(',')},
        formControlSchema: this.customFormSchema,
        data: await this.userForm.state(),
      };

      if(this.todoItem.userDefined.tag.name == ''){
        this.todoItem.userDefined.tag.name = 'has-attachments';
      }
    }

    this.updateParentDescForTree();

    if (this.forEdit !== -1) {
      this.todoService.updateItem({ id: this.forEdit, ...this.todoItem });
    } else {
      this.todoService.addItem(this.todoItem).then(id=>{this.forEdit = id;});
    }


    this.itemSavedEvent.emit(true);

    if(this.navigateBackOnSave){
      let lastNav = this.router.lastSuccessfulNavigation?.finalUrl?.toString();
      if(lastNav?.includes('/home'))
        this.router.navigate(['/home'], { queryParams: this.queryParams });
      else history.back();
    }
  }

  onUpdateTags(tags: Tag[]) {
    this.todoItem.tags = tags;
    this.loadCustomSchemaFromDb(tags);
    this.loadPrimitiveFields(tags);
  }

  loadPrimitiveFields(tags: Tag[]) {
    tags = tags.filter((tag) => tag.name.startsWith('form-'));
    if (tags.length === 0) return;
    this.customFormSchema = this.todoItem.userDefined?.formControlSchema;
    let fields: FormField[] = [];
    for (let i = 0; i < tags.length; i++) {
      let tagType = tags[i].name.substring(5);
      fields.push({
        name: tagType + '_' + i ,
        label: tagType + '_' + i ,
        type: tagType as FormField['type'],
        placeholder: '',
        default: '',
      });
    }
    this.appendCustomSchemaFields(fields);
  }

  loadCustomSchemaFromDb(tags: Tag[]) {
    tags = tags.filter((tag) => tag.name.startsWith('form-'));
    if (tags.length === 0) return;

    this.customFormSchema = this.todoItem.userDefined?.formControlSchema;

    this.todoService.getAllCustom(tags).subscribe((resultArray) =>
      resultArray.forEach((res) => {
        let schema = res?.item;
        if (!schema) return;
        try {
          schema.fields?.forEach((field: FormField) => {
            let data = this.customFormData;
            if (data) {
              data = new Map(Object.entries(data));
              let value = data.get(field.name);
              if (value) {
                field.default = value;
              }
            }
          });
          this.appendCustomSchemaFields(schema.fields);
        } catch (e) {
          console.error('failed to load schema ' + tags, schema, e);
        }
      })
    );
  }

  appendCustomSchemaFields(fields: FormField[]) {
    if (!fields || fields.length == 0) return;

    if (this.customFormSchema && this.customFormSchema.fields) {
      this.customFormSchema = {
        fields: [...this.customFormSchema.fields, ...fields],
      };
    } else {
      this.customFormSchema = { fields: fields };
    }
  }

  onClickUserFormAdd(event: Event) {
    if (this.schemaEditingInProgress) {
      try {
        //first remove comments
        this.todoItem.description = this.todoItem.description
          .replaceAll(/\/\*[\s\S]*?\*\//g, '')
          .replaceAll(/\//g,'\\/')
          .replaceAll('<','&lt;')
          .replaceAll('>','&gt;');

        let formSchema = JSON.parse(this.todoItem.description);
        if (!formSchema.tag || !formSchema.formControlSchema) {
          this.toaster.error(
            'please provide a unique tag and schema for this shcema!'
          );
          return;
        }

        let tag = 'form-' + formSchema.tag.trim();
        this.todoItem.tags.push({ name: tag });
        this.todoService.addCustom(tag, formSchema.formControlSchema);

        if (this.customFormSchema && this.customFormSchema.fields) {
          this.customFormSchema = { // for angular to properly update ui. as only reference change is tracked.
            fields: [
              ...this.customFormSchema.fields,
              ...formSchema.formControlSchema.fields,
            ],
          };
        } else {
          this.customFormSchema = formSchema.formControlSchema;
        }

        this.todoItem.description = localStorage['tempTodoDescription'];
        this.schemaEditingInProgress = false;
        return;
      } catch (e) {
        console.error('Error parsing schema - ');
        console.error(e);
        console.error('input schema - ', this.todoItem.description);
        this.toaster.error('error parsing the schema please try aggain');
        return;
      }
    }
    localStorage['tempTodoDescription'] = this.todoItem.description;
    this.todoItem.description =
     `/* Please add your json schema for desired custom form here -
      * Remove this commented part before save; Dont worry your description will be back once you save the schema by clicking the same 'add custom form' button
      * the format is -
      * {
      *   "tag" : string,
      *   "formControlSchema" : {
      *     "fields": [
      *        {
      *         "name" : string,
      *         "label" : string,
      *         "type" : 'text' | 'textarea' | 'email' | 'password'
      *                  | 'number' | 'date' | 'select' | 'checkbox' | 'radio' | 'boolean' | 'image' | 'file' | 'iframe' | 'canvas'
      *                  | 'color' | 'range' | 'month' | 'date' | 'time' | 'datetime-local' | 'timestamp' | 'history',
      *         "placeholder"?: string,
      *         "validation"?: {
      *             "require"? : boolean,
      *             "readonly"?: any, // set any value for readonly control
      *             "minLength"?: number,
      *             maxLength"?: number,
      *             pattern"? : string,
      *             "min"? : string,
      *             "max"? : string,
      *             "step"? : string
      *         },
      *         "default"?: string,
      *         "options"?: string // , seperated options
      *       }
      *     ]
      *   },
      *   "data" : Map<string, string> | null
      * }
      *
      * sample -
      *   {"tag":"sample", "formControlSchema": {"fields": [{"name":"sample", "label":"sample text", "type":"text"}]}, "data":[["sample", "current value"]]}\n*/\n\n\n`;
    if (this.todoItem.userDefined) {
      if (this.todoItem.userDefined.formControlSchema.fields) {
		    this.todoItem.description += JSON.stringify(
          this.todoItem.userDefined,
          null,
          4
        );
      }
    }

    this.schemaEditingInProgress = true;
  }

  onReminderClick() {
    this.todoItem.setForReminder = !this.todoItem.setForReminder;
  }

  onCompletionClick() {
    this.todoItem.completionStatus = !this.todoItem.completionStatus;
  }

  onNavigateToCompView(){
    if(!this.router.url.endsWith('/comp')){
     // this.navigateBackOnSave=false;
     // this.onAddClick();
     this.router.navigate(['/comp'], {});
    }
  }


  ngOnDestroy(): void {
    if(this.userSubscription){
      this.userSubscription.unsubscribe();
    }
    if(this.compoundViewActiveItemSubscription){
      this.compoundViewActiveItemSubscription.unsubscribe();
    }
  }
}

