import { Component } from '@angular/core';
import { CalendarComponent } from '../calendar/calendar.component';
import { EditorComponent } from '../editor/editor.component';
import { HomeComponent } from './../home/home.component';
import { VisualizeComponent } from '../visualize/visualize.component';
import { TodoItem } from '../../models/todo-item';
import { BehaviorSubject, Observable } from 'rxjs';
import { CommonModule } from '@angular/common';


@Component({
  selector: 'app-compound-view',
  imports: [HomeComponent, EditorComponent, CommonModule],
  templateUrl: './compound-view.component.html',
  styleUrl: './compound-view.component.css'
})
export class CompoundViewComponent {

  private activeItemSubject = new BehaviorSubject<TodoItem | null>(null);
  activeItem$ : Observable<TodoItem | null> = this.activeItemSubject.asObservable();

  shouldRefreshState = false;
  homeWidthPx = 300;
  private isResizing = false;

  activeItemUpdate(newItem: TodoItem){
    this.activeItemSubject.next(newItem);
  }

  refreshChildren(event: boolean){
    this.shouldRefreshState = true;
    setTimeout(()=>{
      this.shouldRefreshState = false;
    }, 500);
  }

  startResize(event: Event){
    this.isResizing = true;
    event.preventDefault();
    const onMouseMove = (e: MouseEvent) => {
      if (!this.isResizing) return;
      this.homeWidthPx = e.clientX;
    };

    const onMouseUp = () => {
      this.isResizing = false;
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }

}
