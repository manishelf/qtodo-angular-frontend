import { Injectable } from '@angular/core';
import { ToastService } from 'angular-toastify';
import { BehaviorSubject, last } from 'rxjs';

import {Axios} from 'axios';
import { UserService } from './../user/user.service';
import { Route, Router } from '@angular/router';
import { TodoItem } from '../../models/todo-item';
import { TodoItemUpdateService } from '../todo/todo-item-crud/local-crud/todo-item-update.service';
import { SOC_OP } from './socket/socket.worker';
import { localUser , escapeCharsRex} from '../consts';

@Injectable({
  providedIn: 'root',
})
export class ConnectionService {

  backendUrl: string = '';

  socketWorkers: Map<string,Worker> = new Map();

  private connected: BehaviorSubject<boolean> = new BehaviorSubject(false);
  connected$ = this.connected.asObservable();

  private accessToken: string = '';

  axios: Axios = new Axios();

  constructor(private toaster: ToastService,
     private userService : UserService,
     private router: Router) {


    this.backendUrl = localStorage['qtodo_backend_url'];

    if (!this.backendUrl && window.location.href.includes('/ang/')){
      this.backendUrl = window.location.href.split('/ang/')[0];
    }

    if (this.backendUrl && this.backendUrl !== 'null') {
      this.connectToBackend().then(
        (con)=>{
          if(!con) return;
          let recentLoginsMap = localStorage['recentLogins'];
          if(!recentLoginsMap || recentLoginsMap == 'null') {
            this.router.navigate(['/login']);
            return;
          }
          let lastUser = this.userService.getLastLoggedInUser();

          if(lastUser.email == localUser.email)
            return;

          this.userService.loggedInUser.next(lastUser);

          this.getToken().then(token=>{
            if(token && token != ''){
              lastUser.token = token;
              localStorage['recentLogins'] = JSON.stringify(recentLoginsMap);
            }
          });
        }
      );
    }

    this.connected$.subscribe((con) => {
      if (con) {
        this.toaster.info('connected to backend successfully!');
      } else {
        this.toaster.error(
          'disconnected from backend! switched to offline mode'
        );
      }
    });

    this.userService.loggedInUser.subscribe(async (user)=>{
      if(user.email == localUser.email){
        this.accessToken = '';
      }else{
        this.accessToken = user.token || '';

        await this.refreshTokenIfExpired();

        let payload = this.userService.getPayloadFromAccessToken();

        if(payload && payload['user_group_colaboration'] && !this.socketWorkers.get(payload['user_group'])){
          let wsWorker = new Worker(new URL('/socket/socket.worker.ts', import.meta.url));
          wsWorker.postMessage({
            op: SOC_OP.INIT,
            target: { user, backendUrl: this.backendUrl}
          });
          this.socketWorkers.set(payload['user_group'], wsWorker);
        }
      }
    });

    this.axios.interceptors.request.use(async (config)=> {

        if(this.accessToken != ''
        && !(config.url?.includes('/user/refresh') || config.url?.includes('/user/logout'))){
          await this.refreshTokenIfExpired();
        }

        if(config.url === '/item/save' || config.url === '/item/update'){
          config.data.itemList.forEach((item: TodoItem)=>{
            if(item.userDefined){
              item.userDefined.formControlSchema.fields?.forEach((field)=>{

                if(item.userDefined?.data){
                  if(field.type == 'image' || field.type == 'file' || field.type == 'iframe'){
                    let user = this.userService.loggedInUser.value;
                    let fieldKey = item.uuid+'_'+item.subject.replaceAll(escapeCharsRex, '_')+'_'+item.userDefined?.tag.name+'_'+field.name.replaceAll(escapeCharsRex,"_");

                    let data = (item.userDefined.data as any )[field.name] || '';
                    (item.userDefined.data as any)[field.name]=
                      '/item/doc/'+user.userGroup+'/'+user.email.replaceAll(escapeCharsRex,'_')+'/'+fieldKey;

                    const parts = data.split(';');
                    const mimeType = parts[0].split(':')[1];
                    let dataType = mimeType;

                    this.postFileToBackend(
                      data,
                      fieldKey,
                      dataType,
                      fieldKey
                    ).then((refUrl)=>{

                    }).catch(()=>{
                      (item.userDefined?.data as any)[field.name]=data;
                    });
                  }
                }
              });
            }
          });
        }

        if(config.url?.includes('/user/signup') && config.data.profilePicture){

          let user = config.data;
          let pictureData = config.data.profilePicture;
          if(pictureData){
            const parts = config.data.profilePicture.split(';');
            const mimeType = parts[0].split(':')[1];
            let fileInfo = 'profile_pic_'+user.userGroup;

            config.data.profilePicture=user.userGroup+'_'+user.email.replace('.','_').replace('@','_')+'_'+fileInfo;
            setTimeout(()=>{
              this.postFileToBackend(pictureData, fileInfo,mimeType, fileInfo)
            },1000);
          }
        }

        config.headers.Authorization = 'Bearer '+ this.accessToken;
        if(!(config.data instanceof FormData)){
          config.data = JSON.stringify(config.data);
        }
        if(!config.headers['Content-Type']){
          config.headers['Content-Type'] = 'application/json';
        }
        config.url = this.backendUrl+config.url;
        config.withCredentials = true;
        return config;
      }, function (error) {
        console.error(error);
        return Promise.reject(error);
      },
    );

    this.axios.interceptors.response.use((resp)=>{
      if(resp.data){
        try{
          resp.data = JSON.parse(resp.data);
        }catch {
          // dont deserialize if not json
        }
      }
      if(resp.data.responseMessage){
        if(resp.status == 200)
        this.toaster.success(resp.data.responseMessage);
        else if(resp.status >= 400 && resp.status <= 500){
          if(resp.data.responseMessage.includes('Invalid JWT') && !resp.config.url?.includes('/user/logout')){
            this.logoutUser();
            this.userService.loginUser();
          }
          this.toaster.error(resp.data.responseMessage);
        }else {
          this.toaster.warn(resp.data.responseMessage);
        }
      }
      return resp;
    });
  }

  isTokenExpired(token:string) {
    try {
      const payloadBase64 = token.split('.')[1];
      let expirationTimeInSeconds = 0;
      if(payloadBase64){
        const decodedPayload = atob(payloadBase64);
        const payload = JSON.parse(decodedPayload);
        expirationTimeInSeconds = payload.exp*1000;
      }
      return expirationTimeInSeconds<Date.now();
    } catch (e) {
      console.error("Failed to decode token:", e);
      return null;
    }
  }

  connectToBackend(): Promise<boolean> {
    return new Promise((res, rej) => {
      if (
        !this.backendUrl ||
        this.backendUrl == 'null' ||
        this.backendUrl.trim() == ''
      ) {
          this.backendUrl =
          prompt('Enter backend server url to use cross device!') || '';

          this.backendUrl = this.backendUrl.replace(/\/+$/, ''); // remove trailing /
      }

      if (
        this.backendUrl &&
        this.backendUrl != 'null' &&
        this.backendUrl.trim() != ''
      ) {
        fetch(this.backendUrl + '/up')
          .then((resp) => {
            if (resp.ok && resp.body) {
              let body = resp.body;
              let reader = body?.getReader();
              let decoder = new TextDecoder();
              reader?.read().then((readerResult) => {
                let resp = decoder.decode(readerResult.value, {
                  stream: !readerResult.done,
                });
                this.toaster.info(resp);
              });
              this.connected.next(true);
              localStorage['qtodo_backend_url'] = this.backendUrl;
              res(true);
            }
          })
          .catch((e) => {
            console.error('unable to connect to ' + this.backendUrl, e);
            localStorage['qtodo_backend_url'] = null;
            this.backendUrl = '';
            this.connected.next(false);
            rej(e);
          });
      } else {
        rej('Blank backend Url');
      }
    });
  }

  disconnectFromBackend(): Promise<boolean> {
    return new Promise((res) => {
      this.connected.next(false);
      this.backendUrl = '';
      localStorage['qtodo_backend_url'] = null;
      res(true);
    });
  }

  logoutUser(){
    this.axios.post('/user/logout');
    this.accessToken = '';
    this.userService.loggedInUser.next(localUser);
  }

  dataURLtoBlob(dataurl: string): Blob {
    const arr = dataurl.split(',');
    const mime = arr[0].match(/:(.*?);/);
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) {
      u8arr[n] = bstr.charCodeAt(n);
    }
    return new Blob([u8arr], {type: mime?mime[1]:''});
  }

  postFileToBackend(fileData: string, fileName: string, fileType: string, fileInfo: string):Promise<string>{
    return new Promise((res, rej)=>{
      let formData = new FormData();
      formData.append('file', this.dataURLtoBlob(fileData));
      formData.append('fileType', fileType);
      formData.append('fileInfo', fileInfo);
      formData.append('fileName', fileName);
      this.axios.post('/item/save/document',
        formData,
        {
          headers:{
            "Content-Type":'multipart/form-data'
          }
        }
      ).then((resp)=>{
        res(resp.data.body);
      });
    });
  }

  async refreshTokenIfExpired(){
    if(this.isTokenExpired(this.accessToken)){
      let resp = await this.axios.get('/user/refresh');
    if(resp.status == 200){
        this.accessToken = resp.data.accessToken;
        this.userService.loggedInUser.value.token = this.accessToken;
      }else{
        this.logoutUser();
      }
    }
  }

  getToken(): Promise<string>{
    return new Promise((res, rej)=>{
      this.refreshTokenIfExpired().then(()=>res(this.accessToken));
    });
  }

  async getUrlWithToken(url: string){
    return this.backendUrl+url+'?sessionToken='+await this.getToken();
  }
}
