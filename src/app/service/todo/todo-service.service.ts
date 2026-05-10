import { Injectable, OnDestroy } from '@angular/core';
import {
  Observable,
  BehaviorSubject,
  Subscriber,
  timeInterval,
  timeout,
  bufferTime,
  debounceTime,
  switchMap,
  tap,
  of,
  throttle,
  throttleTime,
  mergeMap,
} from 'rxjs';
import { TodoItem } from '../../models/todo-item';
import { TodoItemAddService } from './todo-item-crud/local-crud/todo-item-add.service';
import { TodoItemUpdateService } from './todo-item-crud/local-crud/todo-item-update.service';
import { TodoItemDeleteService } from './todo-item-crud/local-crud/todo-item-delete.service';
import { TodoItemGetService } from './todo-item-crud/local-crud/todo-item-get.service';
import { ToastService } from 'angular-toastify';
import { SortService } from '../sort/sort.service';
import { UserService } from '../user/user.service';
import { User } from '../../models/User';
import { BackendCrudService } from './todo-item-crud/backend-crud/backend-crud.service';
import { Tag } from '../../models/tag';
import { SearchService } from '../search/search.service';
import { IDbRootName, localUser } from '../consts';

@Injectable({
  providedIn: 'root',
})
export class TodoServiceService implements OnDestroy {
  fromBin: boolean = false;

  db!: IDBDatabase;

  private todoItems = new BehaviorSubject<TodoItem[]>([]);
  todoItems$ = this.todoItems.asObservable();

  private changedItem = new BehaviorSubject<TodoItem|null>(null);
  changedItem$ = this.changedItem.asObservable();

  constructor(
    private addService: TodoItemAddService,
    private updateService: TodoItemUpdateService,
    private deleteService: TodoItemDeleteService,
    private getService: TodoItemGetService,
    private searchService: SearchService,
    private sortService: SortService,
    private toaster: ToastService,
    private userService: UserService,
    private backendService: BackendCrudService
  ) {

    userService.loggedInUser$.subscribe((user)=>{
      this.initializeIndexDB(user)
    });

    this.changedItem$.subscribe((changedItem)=>{
      if(!changedItem) return;

      let listUpdated = false;
      /*
      JavaScript's design, combined with Angular's architecture,
      is optimized for UI rendering efficiency, not for raw memory efficiency.
      The "inefficient" data manipulation is a small price to pay :> fu wd
       */
      const updatedList = this.todoItems.value.map((item)=>{
        if(item.id == changedItem.id){
          if(changedItem.deleted){
            listUpdated = true;
            return null;
          }
          else{
            listUpdated = true;
            return {...changedItem};
          }
        }
        return item;
      }).filter(item=>item!=null);

      if(!listUpdated){
        updatedList.push(changedItem);
      }
      this.todoItems.next(updatedList);
    });

    this.backendService.refresh$.subscribe((s)=>{
      if(s){
        this.initializeItems();
      }
    });
  }


  initializeIndexDB(user:User): Promise<IDBDatabase>{
    return new Promise((res, rej)=>{
    let dbName = IDbRootName+'/'+user.userGroup+'/'+user.email;
    console.log(dbName);

    const request = indexedDB.open(dbName, 1);
    request.onerror = (error) => {
      this.toaster.error('error connecting to local idexedDB!');
      console.error('Error opening IndexedDB:', error);
      rej(error);
    };

    request.onupgradeneeded = (event) => {
      let db = (event.target as IDBOpenDBRequest).result;
      const todoItemsStore = db.createObjectStore('todo_items', {
        keyPath: 'id',
        autoIncrement: true,
      });
      const deletedTodoItemsStore = db.createObjectStore(
        'deleted_todo_items',
        { keyPath: 'id', autoIncrement: true }
      );
      const tagsTodoItemStroe = db.createObjectStore('tags_todo_items', {
        keyPath: 'name',
      });
      const customItemStroe = db.createObjectStore('custom_items', {
        keyPath: 'tag',
      });

      todoItemsStore.createIndex('subjectIndex', 'subject', { unique: true });
      todoItemsStore.createIndex('uuidIndex', 'uuid', { unique: true });
      todoItemsStore.createIndex('tagsIndex', 'tags', { multiEntry: true });
      todoItemsStore.createIndex('creationTimestampIndex', 'creationTimestamp');
      todoItemsStore.createIndex('updationTimestampIndex', 'updationTimestamp');

      deletedTodoItemsStore.createIndex('subjectIndex', 'subject', { unique: true });
      deletedTodoItemsStore.createIndex('uuidIndex', 'uuid', {unique: true});
      deletedTodoItemsStore.createIndex('tagsIndex', 'tags', { multiEntry: true });
      deletedTodoItemsStore.createIndex('creationTimestampIndex', 'creationTimestamp');
      deletedTodoItemsStore.createIndex('updationTimestampIndex', 'updationTimestamp');

      tagsTodoItemStroe.createIndex('tagName', 'name', { unique: true });
      customItemStroe.createIndex('tagIndex', 'tag', { unique: true });
      this.toaster.success('setup '+dbName);
    };

    request.onsuccess = (event) => {
      let db = (event.target as IDBOpenDBRequest).result;
      this.db = db;
      res(db);
      db.onerror = (err) => {
        throw (err as any).srcElement.error;
      };
      this.backendService.init(db, user);
      this.initializeItems();
    };
    });
  }

  initializeItems(): void {
    this.getAll().subscribe((items:TodoItem[])=>{
      console.log('DB fetch', Date.now());
      this.todoItems.next(items);
    });
  }

  getDb() : IDBDatabase {
    // TODO: this should return a promise
    // why did I write it like this
    return this.db;
  }

  getAll(): Observable<TodoItem[]> {
    console.log('Get all', Date.now());

    return  this.getService.getAllItems(this.getDb(), this.fromBin).pipe(tap(()=>console.log('Get all done', Date.now())));
  }

  deleteAll(): void {
    let res = prompt(
      `Are you sure you want to delete all items from ${
        this.fromBin ? 'bin' : 'item list'
      }?\n [ Y | N ]`
    );
    if (res === 'Y')
    {
      this.todoItems.next([]);
      this.getService
      .getAllItems(this.getDb(), this.fromBin)
      .subscribe((items) => {
        items.forEach((item) => {
          this.deleteItem(item);
        });
        this.toaster.success(
          'cleared all items from ' + (this.fromBin ? 'bin' : 'todo list')
        );
      });
    }

  }

  searchTodos(
    subjectQuery: string,
    tagFilter: string[] = [],
    searchTerms: string[] = [],
    exact = false,
  ): Observable<TodoItem[]> {
    return this.searchService.searchTodos(
      this.getDb(),
      subjectQuery,
      tagFilter,
      searchTerms,
      this.fromBin,
      exact,
    ).pipe(tap(()=>{
      console.log('search', Date.now());
    }));
  }

  sortTodoItems(order: string[], items: TodoItem[], limit = null): Observable<TodoItem[]> {
    return this.sortService.sortItems(order, items, limit).pipe(tap(()=>{
      console.log('sort',Date.now());
    }));
  }

  addItem(item: Omit<TodoItem, 'id'>) : Promise<number>{
    return new Promise<number>((res,rej)=>{
      if(item.subject.trim()===''){
       item.subject = new Date().toISOString();
      }
      this.addService.addItem(this.getDb(), item, (suc)=>{
          let id = (suc.target as IDBRequest).result;
          res(id);
          this.backendService.addItem(item);
          let savedItem = item as any;
          savedItem.id = id;
          this.changedItem.next(savedItem);
          this.toaster.success('item saved localy');
        },
        (err)=>{
          this.toaster.error('error adding todo item!');
          this.toaster.error((err as any).srcElement.error);
          console.error('error adding todo item: ', err);
          rej(err);
        }
      );


      /*if(item.userDefined)
      this.getCustom(item.userDefined.tag.name).subscribe((schema)=>{
          if(!schema){
            this.addCustom(item.userDefined!.tag.name, item.userDefined!.formControlSchema);
          }
        });*/
    });
  }

  addCustom(tag: string, item: any) {
    this.addService.addCustom(this.getDb(), tag, item,(suc)=>{
      this.toaster.success('saved ' + tag + ' localy');
    },
    (e)=>{
      this.toaster.error('error saving ' + tag);
      console.error('error adding custom item', e);
    });
  }

  getItemById(id: number): Observable<TodoItem> {
    return this.getService.getItemById(this.getDb(), id);
  }

  getItemByUUID(uuid: string):Observable<TodoItem>{
    return this.getService.getItemByUUID(this.getDb(), uuid);
  }

  getCustom(tag: string): Observable<any> {
    return this.getService.getCustom(this.getDb(), tag);
  }

  getAllCustom(tags: Tag[]): Observable<any[]> {
    return this.getService.getAllCustom(this.getDb(), tags);
  }

  getTagWithNameLike(name: string): Observable<Tag[]>{
    return this.getService.getTagWithNameLike(this.getDb(), name);
  }

  updateItem(item: TodoItem): void {
    this.backendService.updateItem(this.getDb(), item);// order is important as subject can change
    this.updateService.updateItem(this.getDb(), item, (suc)=>{
      this.changedItem.next(item);
      this.toaster.success('todo item updated localy');
    },(e)=>{
      this.toaster.error('error updating todo item');
      console.error('error updating todo item: ', e);
    });
  }

  updateCustom(tag: string, item: any): void {
    this.updateService.updateCustom(this.getDb(), tag, item, (suc)=>{
      this.toaster.success('updated ' + tag + ' localy');
    },(e)=>{
      this.toaster.error('error updating ' + tag);
      console.error('error updating ' + tag, e);
    });
  }

  deleteItem(item: TodoItem): void {
    try {
      this.deleteService.deleteItem(this.getDb(), item, this.fromBin);
      item.deleted = true;
      this.changedItem.next(item);
      this.backendService.deleteItem(item);
      this.toaster.success('todo item deleted localy');
    } catch (e) {
      this.toaster.error('error deleting todo item');
      console.error('error deleting todo item: ', e);
    }
  }

  deleteItemById(id: number): void {
    this.getService.getItemById(this.getDb(), id).subscribe((item) => {
      this.deleteItem(item);
    });
  }

  serializeOneToJson(item: TodoItem): string {
    let ud = JSON.stringify(item.userDefined, null, 4);
    ud = ud?ud:'{"tag":{"name":""}, "formControlSchema":{"fields":[]}}';
    return `
    {
      "id": ${item.id ? item.id : null},
      "subject": ${JSON.stringify(item.subject)},
      "description": ${JSON.stringify(item.description)},
      "tags": [${item.tags.map(
        (tag) =>
          `{"id": ${tag.id ? tag.id : null}, "name": "${tag.name.replace(
            /\"/g,
            '&quot;'
          )}"}`
      )}],
      "completionStatus": ${item.completionStatus},
      "setForReminder": ${item.setForReminder},
      "creationTimestamp": "${item.creationTimestamp}",
      "updationTimestamp": "${item.updationTimestamp}",
      "eventStart": ${item.eventStart ? '"' + item.eventStart + '"' : null},
      "eventEnd": ${item.eventEnd ? '"' + item.eventEnd + '"' : null},
      "eventFullDay": ${item.eventFullDay ? item.eventFullDay : false},
      "deleted": ${item.deleted ? item.deleted : false},
      "userDefined": ${ud}
    }`;
  }

  serializeManyToJson(items: TodoItem[]): Observable<string> {
    return new Observable<string>((subscriber) => {
      subscriber.next(`{ "items": [
        ${items.map((item) => this.serializeOneToJson(item) + '\n')}]}`);
    });
  }

  deserializeOneFromJson(jsonString: string): TodoItem {
    let item: TodoItem = {
      id: Number.MIN_VALUE,
      version: 0,
      uuid: '',
      subject: '',
      description: '',
      tags: [],
      completionStatus: false,
      setForReminder: false,
      creationTimestamp: '',
      updationTimestamp: '',
      eventStart: '',
      eventEnd: '',
      eventFullDay: false,
      deleted: false,
      userDefined: { tag: {name:''}, formControlSchema: {}, data: null },
      owningUser: localUser
    };
    try {
      item = JSON.parse(jsonString);
    } catch (e) {
      console.error('error deserializing json string to todo item', e);
      this.toaster.error('error deserializing json string to todo item ');
    }
    return item;
  }

  deserializeManyFromJson(jsonString: string): Observable<TodoItem[]> {
    return new Observable<TodoItem[]>((Subscriber) => {
      let items: TodoItem[] = [];
      try {
        let result = JSON.parse(jsonString);
        items = result.items;
      } catch (e) {
        console.error('error deserializing json string to todo item', e);
        this.toaster.error('error deserializing json string to todo item ');
      }
      Subscriber.next(items);
    });
  }

  async addMany(items: TodoItem[]) {
    let addList = [];
    let staleItems : TodoItem[] = [];
    let updateList = [];
    let errorList:any[] = [];
    let done = new BehaviorSubject<boolean>(false);
    let currDBErrorHandler = this.getDb().onerror;
    this.getDb().onerror = (err)=>{
      errorList.push(err);
    };

    for (let i = 0; i <= items?.length; i++) { // async as sync? wtf
      let item = items[i];

      if(!item) continue;

      if(item.subject.trim()===''){
      item.subject = new Date().toISOString();
      }
      this.addService.addItem(this.getDb(), item, (suc)=>{
          let id = (suc.target as IDBRequest).result;
          let savedItem = item as any;
          savedItem.id = id;
          addList.push(savedItem);

          done.next(true);
        },
        (err)=>{
          this.getItemById(item.id).subscribe((existingItem) => {
            if (existingItem) {
              if (
                new Date(existingItem.updationTimestamp) <
                new Date(item.updationTimestamp)
              ){
                this.updateService.updateItem(this.getDb(), item, (suc)=>{
                  updateList.push(item);

                  done.next(true);
                }
              );
              }
            } else {
              this.searchTodos(item.subject).subscribe((existingItem) => {
                if (
                  new Date(existingItem[0].updationTimestamp) <
                  new Date(item.updationTimestamp)
                ) {
                  this.updateItem(item);
                  this.updateService.updateItem(this.getDb(), item, (suc)=>{
                    updateList.push(item);

                    done.next(true);
                  });
                }
              });
            }
          });
        }
      );
    }
    done.pipe(debounceTime(100)).subscribe((s)=>{ // runs after 100 ms of inactivity
        if(s){
          this.getDb().onerror = currDBErrorHandler;
          if(addList.length>0)
          this.toaster.success(`added ${addList.length} items`);

          if(updateList.length>0)
          this.toaster.success(`updated ${updateList.length} items`);

          if(errorList.length>0)
          this.toaster.error(`encountered ${errorList.length} errors`);

          if(staleItems.length>0)
          this.downloadTodoItemsAsJson(staleItems, 'stale');

          this.initializeItems();
        }
      });
  }

  downloadTodoItemsAsJson(items: TodoItem[], fileName: string = 'todo'){
    this.serializeManyToJson(items).subscribe((json) => {
        let blob = new Blob([json], { type: 'application/json' });
        let url = URL.createObjectURL(blob);
        let a = document.createElement('a');
        a.href = url;
        a.download = `${fileName}-${new Date().toLocaleString().replaceAll(/[ ,:/]/g,'_')}.json`;
        a.click();
        this.toaster.success('downloaded '+ items.length+' '+fileName + ' items');
        URL.revokeObjectURL(url);
    });
  }

  ngOnDestroy(): void {
    this.todoItems.unsubscribe();
    this.changedItem.unsubscribe();
  }
}
