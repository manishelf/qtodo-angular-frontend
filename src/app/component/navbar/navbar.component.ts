import {
  AfterViewInit,
  Component,
  ElementRef,
  HostListener,
  Input,
  ViewChild,
} from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { NavigationEnd, Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { ToastService } from 'angular-toastify';
import { TodoServiceService } from '../../service/todo/todo-service.service';
import { filter } from 'rxjs';
import { TodoItem } from '../../models/todo-item';
import { SortService } from './../../service/sort/sort.service';
import { UserService } from '../../service/user/user.service';
import { localUser } from '../../service/consts';
import { ConnectionService } from '../../service/connection/connection.service';
import { User } from './../../models/User';
import { BeanItemComponent } from '../bean-item/bean-item.component';

@Component({
  selector: 'app-navbar',
  imports: [MatIconModule, CommonModule, BeanItemComponent],
  templateUrl: './navbar.component.html',
  styleUrl: './navbar.component.css',
})
export class NavbarComponent implements AfterViewInit {
  accessToken: string | null = null;
  @ViewChild('searchBox') searchBox!: ElementRef;

  lastQueryParams: any = null;
  online: boolean = false;

  menuHidden: boolean = true;

  @Input() user: User | null = null;

  recentLogins: any = {};
  selectedUserIndex = 0;
  private lastUserLoginArrSize = 0;

  userProfilePicture: string | null = null;

  currentTheme: string = '';

  availableThemes: any = {
    "classic-professional": [
    "white",
    "minimal",
    "academic",
    "normal",
    "newspaper"
    ],
    "vibrant-nature": [
    "zen",
    "sunny",
    "lime",
    "tropical"
    ],
    "cool-tones": [
    "nord"
    ],
    "minimal-dark": [
    "dark",
    "compact"
    ],
    "developer-palettes": [
    "tokyo-night",
    "dracula",
    "one-dark-pro",
    "monokai-pro"
    ],
    "retro-futuristic": [
    "synthwave-84",
    "hacker",
    "neon"
    ],
    "background": [
      "GameOfLife",
      "JuliaSet",
      "JuliaSet0_7885",
      "Arkanoid",
      "MandelBrotSet",
      "LineGrid",
      "Checkered",
      "plain"
    ],
    "random":[
      "random"
    ],
  };

  constructor(
    private router: Router,
    private toaster: ToastService,
    private todoService: TodoServiceService,
    private sortService: SortService,
    private userService: UserService,
    private connectionService: ConnectionService
  ) {
    let l = localStorage['lastQueryParams'];
    if(l){
      this.lastQueryParams = JSON.parse(l);
      if(this.lastQueryParams){
        setTimeout(()=>{
          this.searchBox.nativeElement.value = this.reconstructParams(this.lastQueryParams);
          this.lastQueryParams = null;
        }, 200);
      }
    }

    // to avoid keyboards from poping upp on phones constantly
    if (window.innerWidth > 400) {
      this.router.events
        .pipe(filter((e) => e instanceof NavigationEnd))
        .subscribe((event) => {
          setTimeout(() => {
            this.searchBox.nativeElement.focus();
          }, 100);
        });
    }

    connectionService.connected$.subscribe((status)=>{
      if(status){
        this.online = true;
      }else {
        this.online = false;
      }
    });

    userService.loggedInUser$.subscribe((user)=>{
      this.user = user;

      if(this.user.profilePicture){
        if(this.user.profilePicture.startsWith('/item/doc/')){
          this.connectionService.getUrlWithToken(this.user.profilePicture).then(url=>this.userProfilePicture=url);
        }else{
          this.userProfilePicture = this.user.profilePicture;
        }
      }else{
        this.userProfilePicture = null;
      }

      this.recentLogins = Object.entries(this.userService.getRecentLogins());
      console.log(this.recentLogins)
      if(this.lastUserLoginArrSize != this.recentLogins.length){
        this.selectedUserIndex = this.recentLogins.length - 1; // in case a user is added pick the latest
      }

      let i = 0;
      for(let e of this.recentLogins){
        if(e[0] == user?.userGroup+'/'+user?.email){
          this.selectedUserIndex = i;
          if(!e[1].preferences || !e[1].preferences.theme){
            const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
            if(prefersDark){
              this.changeTheme('tokyo-night');
            }else{
              this.changeTheme('minimal');
            }
          }else{
            this.changeTheme(e[1].preferences.theme);
          }
          break;
        }
        i++;
      }

      this.lastUserLoginArrSize = this.recentLogins.length;
    });
  }

  reconstructParams(params:any): string{
    if (!params || !params.queryParams) {
      return '';
    }

    const qp = params.queryParams;
    let queryParts = [];
    const mainQuery = qp.q || '';

    if (qp.lim != null) {
      queryParts.push(`!LIM:${qp.lim};`);
    }

    let reconstructedOrderString = '';
    if (qp.ord && Array.isArray(qp.ord) && qp.ord.length > 0) {
      const orderKeywords = ['asc', 'desc', 'lat', 'old'];
      let currentTag = '';
      let currentFields = [];

      const isDefaultAscOnly = qp.ord.length === 1 && qp.ord[0] === 'asc';

      if (!isDefaultAscOnly) {
        for (let i = 0; i < qp.ord.length; i++) {
          const item = qp.ord[i];
          if (orderKeywords.includes(item)) {
            if (currentTag) {
              reconstructedOrderString += `!${currentTag.toUpperCase()}:${currentFields.join(',')};`;
            }
            currentTag = item;
            currentFields = [];
          } else {
            currentFields.push(item);
          }
        }
        if (currentTag) {
          reconstructedOrderString += `!${currentTag.toUpperCase()}:${currentFields.join(',')};`;
        }
        if (reconstructedOrderString) {
          queryParts.push(reconstructedOrderString);
        }
      }
    }
    if (qp.abs === false) {
      queryParts.push(`!ALL:`);
    }

    queryParts.push(mainQuery);

    if (qp.has && Array.isArray(qp.has) && qp.has.length > 0) {
      queryParts.push(`!F:${qp.has.join(' ')}`);
    }

    if (qp.tag && Array.isArray(qp.tag) && qp.tag.length > 0) {
      queryParts.push(`!T:${qp.tag.join(',')}`);
    }


    return queryParts.join('');
  }

  ngAfterViewInit(): void {
    this.searchBox.nativeElement.focus();
  }

  @HostListener('keydown', ['$event'])
  onKeyDown(event: KeyboardEvent): void {
    let target = event.target as HTMLElement;
    if (target instanceof HTMLInputElement) {
      if (event.key === 'Enter') {
        this.searchItems(event);
      }
    }
  }

  searchItems(event: Event): void {
    let searchQuery = (event.target as HTMLInputElement).value;

    if(searchQuery.trim() === ''){
      this.router.navigate([]);
      return;
    }

    let tagList: string[] = [];
    let input = [''];
    let exact = false;
    let lim: number | null = null;
    let order = [];

    const populateFields = (x: string) => {
      if(x.startsWith('!')) return; // incase a following tag is used

      let fields = x?.substring(0, x?.indexOf(';'))?.split(',').map(f=>f.trim());
      fields?.map((field) => field.trim()).filter((field) => field != '');
      order.push(...fields);
      searchQuery = input[1].substring(input[1]?.indexOf(';') + 1);
    };

    input = searchQuery.split('!LIM:');
    if(input.length == 2){
      let l = input[1].substring(0,input[1].indexOf(';'));
      lim = Number.parseInt(l);
      searchQuery = input[1].substring(input[1].indexOf(';')+1);
    }

    input = searchQuery.split('!ASC:');
    if (input.length == 2) {
      order.push('asc');
      populateFields(input[1]);
    } else {
      input = searchQuery.split('!DESC:');
      if (input.length == 2) {
        order.push('desc');
        populateFields(input[1]);
      } else {
        order.push('asc');
      }
    }

    input = searchQuery.split('!LAT:');
    if (input.length == 2) {
      order.push('lat');
      populateFields(input[1]);
    }

    input = searchQuery.split('!OLD:');
    if (input.length == 2) {
      order.push('old');
      populateFields(input[1]);
    }

    input = searchQuery.split('!FAM:');
    if(input.length == 2){
      searchQuery = `!ALL:${input[1]}!T:child of ${input[1]}`
    }

    exact = !searchQuery.startsWith('!ALL:');
    if (!exact) {
      searchQuery = searchQuery.split('!ALL:')[1];
    }

    input = searchQuery.split('!F:');
    let searchTerms: string[] = [];
    if (input.length == 2) {
      searchQuery = input[0];
      searchTerms = input[1].split(' ');
    }

    input = searchQuery.split('!T:');
    if (input.length == 2) {
      searchQuery = input[0];
      tagList = input[1].split(',');
      tagList = tagList.map((tag) => tag.trim());
    }

    order = order.filter(o=>o!='');

    let extras = {
      queryParams: {
        lim:lim,
        ord: order,
        abs: exact,
        q: searchQuery.trim(),
        tag: tagList,
        has: searchTerms,
      },
    };
    this.lastQueryParams = extras;
    localStorage['lastQueryParams'] = JSON.stringify(this.lastQueryParams);
    this.router.navigate([], extras);
  }

  syncNotes(): void {
    this.toaster.info('Downloading notes...');
    this.todoService.fromBin = false;

    if(this.lastQueryParams){
      let {lim , ord, abs, q, tags, has} = this.lastQueryParams?.queryParams;
      this.todoService.searchTodos(q,tags,has,abs)
        .subscribe((itemList)=>{
          this.sortService.sortItems(ord,itemList,lim).subscribe((itemList)=>{
            this.save(itemList);
          });
        });
    }else{
      this.todoService.getAll().subscribe((itemList) => {
        this.save(itemList);
      });
   }
  }

  save(list: TodoItem[]){
    this.toaster.info('Merging '+list.length+' items');

    this.todoService.downloadTodoItemsAsJson(list);
  }

  uploadNotes() {
    this.todoService.fromBin = false;
    let inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = '.json';
    inp.onchange = (e) => {
      let file = (e.target as HTMLInputElement).files![0];
      let reader = new FileReader();
      reader.readAsText(file);
      reader.onload = (event) => {
        let jsonBuffer = event.target!.result;
          if(jsonBuffer){
            this.todoService
            .deserializeManyFromJson(jsonBuffer.toString())
            .subscribe((itemList) => {
              this.todoService.addMany(itemList);
            });
          }
      };
    };
    inp.click();
  }

  toggleBackendConnection(){
    if(this.online){
      this.online = false;
      this.userService.softLogoutUser();
    }else{
      this.online = true;
      this.userService.loginUser();
    }
  }

  changeCurrentUser(event: Event){
    let ele = event.target as HTMLInputElement;
    let i = (ele?.value as any) || this.recentLogins.length-1;

    let user = this.recentLogins[i][1]; // reversed
    this.selectedUserIndex = i;
    this.userService.loggedInUser.next(user);
  }

  changeTheme(themeName: string){
    if(themeName === 'random'){
      const allThemes = Object.values(this.availableThemes)
        .flat()
        .filter(name => name !== 'random'
          && !this.availableThemes['background'].includes(name));
        // O(n*3)?

      const randomIndex = Math.floor(Math.random() * allThemes.length);
      themeName = allThemes[randomIndex] as string;
    }

    document.documentElement.setAttribute('data-theme', themeName);
  }

  updateTheme(event: Event){
    let target = event.target as HTMLSelectElement;
    let sel = target.value;

    if(this.availableThemes["background"].includes(sel)){
      localStorage['background'] = sel;
      target.selectedIndex = 0;
      return;
    }


    if(document.startViewTransition){
      document.startViewTransition(()=>{
        this.changeTheme(sel);
      });
    }
    else this.changeTheme(sel);

    this.userService.updateUserPreferences({theme: sel});

    this.currentTheme = sel; // wierd bug where the theme name does not change on selection
    target.selectedIndex = 0;
  }

  getCategories(): string[] {
    return Object.keys(this.availableThemes);
  }
}
