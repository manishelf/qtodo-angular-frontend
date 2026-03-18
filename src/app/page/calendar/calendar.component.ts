import { Component, signal, ChangeDetectorRef, AfterViewInit, viewChild, ElementRef, ViewChild, OnInit, Inject } from '@angular/core';
import { APP_BASE_HREF, CommonModule } from '@angular/common';
import { TodoServiceService } from '../../service/todo/todo-service.service';
import { TodoItem } from '../../models/todo-item';
import { Router, TitleStrategy, withDebugTracing } from '@angular/router';
import { Subscription } from 'rxjs';
import {v4 as uuidv4} from 'uuid';
import { ConnectionService } from '../../service/connection/connection.service';
import { UserService } from '../../service/user/user.service';
import { localUser } from '../../service/consts';

declare var FullCalendar: any;

// example found at https://github.com/fullcalendar/fullcalendar-examples
@Component({
  selector: 'app-calendar',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './calendar.component.html',
  styleUrl: './calendar.component.css',
})
export class CalendarComponent implements AfterViewInit{
  
  calendarVisible = signal(true);
  initialEvents: any = [];
  viewByUpdationTimestamp = signal(false);
  eventListVisible = signal(true);
  startResize = false;
  itemList: TodoItem[] = [];

  @ViewChild('calendarContainer') calendarContainer!: ElementRef;
  @ViewChild('panelContainer') panelContainer!: ElementRef;


  calendarOptions: any = null; 

  currentEvents = signal<any[]>([]);
  
  calanderObj: any;

  constructor(
    private changeDetector: ChangeDetectorRef,
    private todoService: TodoServiceService,
    private router: Router,
    private userService: UserService,
    @Inject(APP_BASE_HREF) private baseHref : string
  ) {
    this.todoService.fromBin = false;
    if(!document.getElementById('fullcalander-script')){
      let script = document.createElement('script');
      script.src = `${this.baseHref.replace(/\/$/, '')}/fullcalendar.global.min.js`;
      script.id ='fullcalander-script';
      script.async = true;
      script.onload = this.afterScriptLoadInit.bind(this);
      document.body.appendChild(script);
    }else{
      requestAnimationFrame(this.afterScriptLoadInit.bind(this));
    }
  }

  init(): void {
    if(!this.calendarOptions){
      this.calendarOptions = signal<any>({
          headerToolbar: {
            left: 'prev,next today',
            center: 'title',
            right: 'dayGridMonth,timeGridWeek,timeGridDay,listWeek,multiMonthYear',
          },
          initialView: 'dayGridMonth',
          businessHours: {
            daysOfWeek: [ 1, 2, 3, 4 , 5], // Monday - Friday
            startTime: '8:00', 
            endTime: '18:00', 
          },
          weekends: true,
          editable: true,
          selectable: true,
          droppable: true,
          // selectMirror: true,
          dayMaxEvents: true,
          eventStartEditable: true,
          nowIndicator: true,
          navLinks: true,
          longPressDelay: 100,
          eventContent: this.customEventContent.bind(this),
          eventClick: this.handleEventClick.bind(this),
          eventsSet: this.handleEvents.bind(this),
          eventChange: this.handleEventChange.bind(this),
          eventRemove: this.handleEventRemove.bind(this),
          select: this.handleDateSelect.bind(this),
          // adding click improves behaviour for phones but creates two events on pc.
        });
      }
    this.todoService.todoItems$.subscribe((items)=>{
      this.calendarOptions.update((curr:any)=>{
        let events = (fetchInfo: any, successCallback: any, failureCallback: any) => {
              this.itemList = items;

              this.itemList = this.itemList.sort((x,y)=>{
                if(this.viewByUpdationTimestamp()){
                  return new Date(x.updationTimestamp) < new Date(y.updationTimestamp) ? -1 : 1 ;
                }else{
                  return new Date(x.creationTimestamp) < new Date(y.creationTimestamp) ? 1 : -1;
                }
              });

              const events: any[] = items.map((item) => {
                return {
                    id: item.id.toString(),
                    title: item.subject,
                    start: item.eventStart ? item.eventStart : item.creationTimestamp,
                    end: item.eventEnd ? item.eventEnd : item.creationTimestamp,
                    allDay: item.eventFullDay,
                    color: item.setForReminder?'orange':(item.completionStatus?'green':''),
                  }
                }
              )
              successCallback(events);
          }
          curr.events = events;
          if(this.calanderObj){
            this.calanderObj.setOption('events', events);
          }
          return curr;
        });
    });
  }

  afterScriptLoadInit(): void {
    this.init();    
    let calander = new FullCalendar.Calendar(this.calendarContainer.nativeElement, this.calendarOptions());
    calander.render();
    this.calanderObj = calander;
  }

  ngAfterViewInit(): void {
    
  }

  customEventContent(eventInfo: any){    
    let event = document.createElement('div');
    event.classList.add('text-center');
    let timeInfo = document.createElement('b');
    timeInfo.innerHTML = eventInfo.timeText + '&nbsp;';
    let eventSubject = document.createElement('i');
    eventSubject.innerText = eventInfo.event.title;
    event.appendChild(timeInfo);
    event.appendChild(eventSubject);    
    return {domNodes: [event]};
  }

  forceFullCalendarResize(){
    requestAnimationFrame(()=>{
      this.calanderObj.updateSize();
    });
  }

  handleCalendarToggle() {
    this.calendarVisible.update((bool) => !bool);
    if(this.calendarVisible()){
      this.calanderObj.render();
    }
  }

  handleWeekendsToggle() {
    this.calendarOptions.update((options: any) =>{
      options.weekends = !options.weekends;
      this.calanderObj.setOption('weekends', options.weekends);
      return options;
    });
  }

  handleDateSelect(selectInfo: any) {
    const title = prompt('Please enter a new title for your event');
    const calendarApi = selectInfo.view.calendar;

    calendarApi.unselect(); // clear date selection

    if (title) {
      let start = selectInfo.startStr
        ? selectInfo.startStr
        : selectInfo.dateStr;
      let end = selectInfo.endStr ? selectInfo.endStr : selectInfo.dateStr;
      const newTodoItem: Omit<TodoItem, 'id'> = {
        uuid: uuidv4(),
        version:0,
        subject: title,
        description: '',
        creationTimestamp: start,
        updationTimestamp: new Date().toISOString(),
        completionStatus: false,
        setForReminder: true,
        eventStart: start,
        eventEnd: end,
        tags: [{ name: 'calendar event' }],
        eventFullDay: selectInfo.allDay,
        owningUser: this.userService.loggedInUser.value
      };
      this.todoService.addItem(newTodoItem);
    }
  }

  handleEventClick(clickInfo: any) {
    this.todoService
      .getItemById(Number.parseInt(clickInfo.event.id))
      .subscribe((item) => {
        if (item) {
          this.router.navigate(['/edit'], { state: { item } });
        }
      });
  }


  handleEventChange(changeInfo: any) {
    const event = changeInfo.event;
    this.todoService.getItemById(Number(event.id)).subscribe((result) => {
      result.creationTimestamp = event.start
        ? event.start.toISOString()
        : new Date().toISOString();
      result.eventStart = event.start
        ? event.start.toISOString()
        : new Date().toISOString();
      result.eventEnd = event.end
        ? event.end.toISOString()
        : new Date().toISOString();
      result.subject = event.title;
      this.todoService.updateItem(result);
    });
  }

  handleEventRemove(removeInfo: any) {
    this.todoService.deleteItemById(Number(removeInfo.event.id));
  }

  handleEvents(events: any[]) {
    this.currentEvents.set(events);
    this.changeDetector.detectChanges();
  }

  handleViewByUpdationTimestampToggle(){
    
    this.viewByUpdationTimestamp.update(s=>!s);

    this.calendarOptions.update((curr: any)=>{
      curr.events=(fetchInfo: any, successCallback: any, failureCallback: any) => {
        const events: any[] = this.itemList.map((item) => {
          return {
            id: item.id.toString(),
            title: item.subject,
            start: item.eventStart ? item.eventStart : this.viewByUpdationTimestamp() ? item.updationTimestamp : item.creationTimestamp,
            end: item.eventEnd ? item.eventEnd : item.creationTimestamp,
            allDay: item.eventFullDay,
            color: item.setForReminder?'orange':(item.completionStatus?'green':''),
          }
        });
        this.itemList = this.itemList.sort((x,y)=>{
          if(this.viewByUpdationTimestamp()){
            return new Date(x.updationTimestamp) < new Date(y.updationTimestamp) ? -1 : 1 ;
          }else{
            return new Date(x.creationTimestamp) < new Date(y.creationTimestamp) ? 1 : -1;
          }
        });
        successCallback(events);
      };
      this.calanderObj.setOption('events', curr.events);
      return curr;
    });
  }

  openItemInEditor(id: string){    
    this.router.navigate(['/edit'],{queryParams:{id}});
  }

  handleResize(event:MouseEvent){
  }

  toggleEventListVisible(){
    this.eventListVisible.update(cur=>!cur);
    if(!this.eventListVisible()){
      this.calanderObj.render();
    }
    this.forceFullCalendarResize();
  }
}
