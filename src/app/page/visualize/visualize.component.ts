import { Component, ElementRef, Inject, OnInit, ViewChild } from '@angular/core';
import { FilterOrReduceService } from '../../service/filterOrReduce/filter-or-reduce.service';
import { SortService } from '../../service/sort/sort.service';
import { TodoServiceService } from '../../service/todo/todo-service.service';
import { ActivatedRoute, Router } from '@angular/router';
import { TodoItem } from '../../models/todo-item';
import { APP_BASE_HREF, CommonModule } from '@angular/common';
import { BehaviorSubject, switchMap } from 'rxjs';
import { MatIcon } from '@angular/material/icon';
import { reduceToFields } from './helpers';
import { drawBarChart, drawLineChart, drawPieChart, loadChartJS, } from './charts';
import { BeanItemComponent } from '../../component/bean-item/bean-item.component';

declare var CanvasJS: any;


@Component({
  selector: 'app-visualize',
  imports: [CommonModule, MatIcon, BeanItemComponent],
  templateUrl: './visualize.component.html',
  styleUrl: './visualize.component.css',
})
export class VisualizeComponent implements OnInit {
  itemList: TodoItem[] = [];
  reducedItemsFlat: [number, any][] = [];
  fields: string[] = [
    'id',
    'subject',
    'completionStatus',
    'setForReminder',
    'creationTimestamp',
    'updationTimestamp',
  ];

  selectedChart$ = new BehaviorSubject<string>('table_chart');

  chartTypes = [
    'table_chart',
    'show_chart',
    'pie_chart',
    'bar_chart',
  ];
  
  @ViewChild('pieChart') pieChartContainer!: ElementRef;

  sortedFields$ = new BehaviorSubject<string[]>([]);
  dataOperations = ['RAW', 'SUM','DIFF','MUL','DIV','MIN','MAX','RANGE', 'MEAN', 'MEDIAN', 'MODE'];
  selectedDataOperation$ = new BehaviorSubject<string>(''); 

  showFunctions: boolean = false;
  sortOrderAsc:boolean = true;

  constructor(
    private filterOrReduceService: FilterOrReduceService,
    private sortService: SortService,
    private todoService: TodoServiceService,
    private router: Router,
    private activatedRoute: ActivatedRoute,
    @Inject(APP_BASE_HREF) private baseHref: string, 
  ) {
    
    this.sortedFields$.subscribe((sortOnfields) => {
      this.sortService
      .sortItems(sortOnfields, this.itemList)
      .subscribe((items) => {
        this.itemList = items;
        this.populateItems(items);
      });
      
      if(sortOnfields.includes("id")) this.sortedFields$.next([]);
    });

    loadChartJS(this.baseHref.replace(/\/$/, '')+'/canvasjs.min.js');
    this.subscribeCharts();

    this.selectedDataOperation$.subscribe((op)=>{
      this.populateItems(this.itemList);
      if(op === 'RAW'){
        return;
      }
      let data = reduceToFields(this.fields.slice(1), this.reducedItemsFlat, op);
      this.reducedItemsFlat = [[ NaN, [NaN]]];
      data.forEach((v, k)=>{
        this.reducedItemsFlat[0][1].push(v);
      });
    });
  }

  ngOnInit(): void {
    this.activatedRoute.queryParams.subscribe((params) => {
      let order = params['ord'] ? params['ord'] : [];
      let exact = params['abs'] ? params['abs'] === 'true' : false;
      let searchQuery = params['q'] ? params['q'] : '';
      let tags = params['tag'] ? params['tag'] : [];
      let searchTerms = params['has'] ? params['has'] : [];
      let limit = params['lim'] ? params['lim'] : null;

      if (order[1] === 'lat' || order[1] === 'old') {
        this.fields = ['id'];
        this.fields.push(...order.slice(2));
      } else if (order.length > 1) {
        this.fields = ['id'];
        this.fields.push(...order.slice(1));
      }
      
      if (
        order.length != 0 ||
        searchQuery !== '' ||
        tags.length > 0 ||
        searchTerms.length > 0
      ) {
        this.todoService.todoItems$.pipe( // only so that the latest changes are used
          switchMap((items)=>{
            return this.todoService.searchTodos(searchQuery, tags, searchTerms, exact) 
          })
        ).pipe(
            switchMap((itemList) => {
              return this.todoService.sortTodoItems(order, itemList, limit)
            })
          ).subscribe((items) => {
              this.itemList = items;
              this.populateItems(items);
              this.selectedChart$.next(this.selectedChart$.value); // refresh chart
            });
      } else {
        this.router.navigate([]);
        this.todoService.todoItems$.pipe(
          switchMap((itemList) => {
            return this.todoService
              .sortTodoItems(order, itemList)
            })
          )
          .subscribe((items) => {
            this.itemList = items;
            this.populateItems(items);
            this.selectedChart$.next(this.selectedChart$.value); // refresh chart
          });
        }
    });
  }
  populateItems(items: TodoItem[]) {
    this.itemList = items;
    this.reducedItemsFlat = this.filterOrReduceService.getReducedItems(
      this.fields,
      items
    );
  }

  subscribeCharts() {
    let data: Map<string, number> = new Map();
    let containerId = 'chartContainer';
    this.selectedChart$.subscribe((chart) => {
      let fields = this.fields.slice(1); // 0 is id
      switch (chart) {
        case 'table_chart':
          break;
        case 'pie_chart':
          this.selectedDataOperation$.subscribe((op)=>{
            data = reduceToFields(fields, this.reducedItemsFlat, op);
            setTimeout(()=>{drawPieChart(containerId, data)},100);
          });
          break;
        case 'bar_chart':
          this.selectedDataOperation$.subscribe((op)=>{
            data = reduceToFields(fields, this.reducedItemsFlat, op);
            setTimeout(()=>{drawBarChart(containerId,data),100});
          });
          break
        case 'show_chart':
          setTimeout(()=>{drawLineChart(containerId, fields, this.itemList, this.reducedItemsFlat)},100);
        break
      }
    });
  }

  toggleSortIndividual(event: Event, field: string) {
    let sortFields = this.sortedFields$.value;
    let set = new Set(sortFields);
    set.add(field);
    let nextFields = Array.from(set);
    if(nextFields.length>1)
    nextFields.shift(); // pop out desc, or asc;
    
    if(this.sortOrderAsc){
      nextFields.unshift('asc');
    }
    else{
      nextFields.unshift('desc');
    }

    if(set.has(field)) // if does not have then keep the ascending order else sort the entire selection to desc
    this.sortOrderAsc = !this.sortOrderAsc;
    
    this.sortedFields$.next(nextFields);
  }

  onItemGoToClicked(event: Event, index: number) {
    this.activatedRoute.queryParams.subscribe((params) => {
      this.router.navigate(['/edit'], {
        state: { item: this.itemList[index], query: params },
      });
    });
  }
}
