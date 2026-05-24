import { Injectable } from '@angular/core';
import { Observable, from, BehaviorSubject, throwError, switchMap, tap, Subscription } from 'rxjs';
import { TodoItem } from '../../../../models/todo-item';
import { TodoItemUtils } from './todo-item-utils';

@Injectable({
  providedIn: 'root'
})
export class TodoItemUpdateService {

  constructor(private todoItemUtils: TodoItemUtils) { }

  
    updateItem(db: IDBDatabase, todoItem: TodoItem, handleSucc = (e:Event)=>{}, handleErr = (e:Event)=>{}) {
      let request = this.todoItemUtils.getObjectStoreRW(db, 'todo_items').get(todoItem.id);
      if(request){
        request.onsuccess = (event)=>{
          let target = event.target as IDBRequest<TodoItem>;                        
          if(target.result.tags.join(',') !== todoItem.tags.join(',')){
            this.updateTags(db, todoItem);
          }
          todoItem.version+=1;
          todoItem.updationTimestamp = new Date(Date.now()).toISOString();
          this.todoItemUtils.getObjectStoreRW(db, 'todo_items').put(todoItem);
          handleSucc(event);
        };
        request.onerror = handleErr;
      }
    }

    updateTags(db: IDBDatabase, todoItem: TodoItem, handleSucc = (e: Event) => {},handleErr = (e: Event) => {}) {

      if (!todoItem.tags || todoItem.tags.length === 0) return;

      const tx = db.transaction(['tags_todo_items'], 'readwrite');
      const store = tx.objectStore('tags_todo_items');

      todoItem.tags.forEach(tag => {
        const name = tag.name.trim();

        const request = store.get(name);

        request.onsuccess = (event) => {
          const target = event.target as IDBRequest;
          let record = target.result;

          if (record) {
            if (!record.todo_items.includes(todoItem.id)) {
              record.todo_items.push(todoItem.id);
            }
            store.put(record);
          } else {
            store.add({ name, todo_items: [todoItem.id] });
          }
        };

        request.onerror = handleErr;
      });

      tx.oncomplete = handleSucc;
      tx.onerror = handleErr;
    }

    /* this is no good because each operation is not in correct transaction and
        creates a race condition also causes unnecessary load
        IndexedDB is not atomic unless you use a single transaction.

        Because every get → modify → put is in a different auto-committed transaction, you get a classic race condition:

        Race Condition 

        Request A reads tag → sees todo_items = [1,2,3]

        Request B reads tag → sees todo_items = [1,2,3]

        A pushes itemId → writes [1,2,3,4]

        B pushes itemId → writes [1,2,3,5]
      updateTagsx(db: IDBDatabase, todoItem: TodoItem, handleSucc = (e:Event)=>{}, handleErr = (e:Event)=>{}): void{
      todoItem.tags?.forEach(
          (tag)=>{
            let name = tag.name.trim();
            let request = this.todoItemUtils.getObjectStoreRO(db, 'tags_todo_items').get(name);
            if(request){
              request.onsuccess = (event)=>{
                let target = event.target as IDBRequest;
                if(target.result){
                  let items = target.result.todo_items;
                  items.push(todoItem.id);
                  this.todoItemUtils.getObjectStoreRW(db, 'tags_todo_items')
                      .put({name: name, todo_items : items});
                }else{
                  this.todoItemUtils.getObjectStoreRW(db, 'tags_todo_items')
                      .add({name: name, todo_items: [todoItem.id]});
                }
                handleSucc(event);                  
              };
              request.onerror = handleErr;
            }
          }
        );
    }
    */

    updateCustom(db: IDBDatabase, tag: string, item: any, handleSucc = (e:Event)=>{}, handleErr = (e:Event)=>{}){
      let request = this.todoItemUtils.getObjectStoreRW(db, 'custom_items').get(tag);
      if(request){
        request.onsuccess = (event)=>{
          let target = event.target as IDBRequest<TodoItem>;
          this.todoItemUtils.getObjectStoreRW(db, 'custom_items').put({tag, item});
          handleSucc(event);
        };
        request.onerror = handleErr;
      }
    }

}
