import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { User } from '../../models/User';
import { ToastService } from 'angular-toastify';
import { Route, Router } from '@angular/router';
import { localUser } from '../consts';

@Injectable({
  providedIn: 'root',
})
export class UserService {
  loggedInUser: BehaviorSubject<User>;
  loggedInUser$: Observable<User>;

  constructor(
    private toaster: ToastService,
    private router: Router,
  ) {
    let user = this.getLastLoggedInUser();
    let userKey = `${user.userGroup}/${user.email}`;

    user.preferences = this.getRecentLogins()[userKey]?.preferences;

    this.loggedInUser = new BehaviorSubject(user);
    this.loggedInUser$ = this.loggedInUser.asObservable();
  }

  signinUser() {
    if (this.loggedInUser.value != null) {
      this.softLogoutUser();
    }
    this.router.navigate(['/signup']);
  }

  loginUser() {
    if (this.loggedInUser.value != null) {
      this.softLogoutUser();
    }
    this.router.navigate(['/login']);
  }

  softLogoutUser() {
    this.loggedInUser.next(localUser);
  }

  getPayloadFromAccessToken(): any{
    const payloadBase64 = (this.loggedInUser.value.token || '').split('.')[1];
    if(payloadBase64){
      const decodedPayload = atob(payloadBase64);
      const payload = JSON.parse(decodedPayload);
      return payload;
    }
    return null;
  }

  isThisCurrentUser(user: User): boolean{
    let currentUser = this.loggedInUser.value;
    return (currentUser.email === user.email)
    && (currentUser.userGroup === user.userGroup);      
  }

  getRecentLogins(): any {
    let recentLogins = localStorage['recentLogins'];
    let localUserKey = `${localUser.userGroup}/${localUser.email}`;
    if(!recentLogins || recentLogins == 'null'){
      recentLogins = `{${localUserKey}:${JSON.stringify(localUser)}}`;
    }
    try{
      return JSON.parse(recentLogins);
    } catch(e){
      let localUserString = JSON.stringify(localUser);  
      localStorage['recentLogins'] = `{${localUserKey}:${localUserString}}`;
      let userMap: any = {};
      userMap[localUserKey] = localUser;
      return userMap;
    }
  }

  getLastLoggedInUser() : User {
    let userKey = localStorage['lastLoggedInAs'];
    if(!userKey){
      userKey = `${localUser.userGroup}/${localUser.email}`;
      localStorage['lastLoggedInAs'] = userKey;
    }
    let recentLoginsMap = this.getRecentLogins();
    return recentLoginsMap[userKey] as User;
  }

  updateUserPreferences(preferencesIn: any){
    if(!preferencesIn) return;

    let loggedInUser = this.loggedInUser.getValue();
    let userKey = `${loggedInUser.userGroup}/${loggedInUser.email}`;
    let localUsers = this.getRecentLogins();
    let localUser = localUsers[userKey];
    
    let preferences: any = (loggedInUser.preferences ? loggedInUser.preferences : (localUser.preferences ? localUser.preferences : {}));

    if(preferencesIn.hideChildItems != undefined){
      preferences.hideChildItems = preferencesIn.hideChildItems;
    }

    if(preferencesIn.theme){
      preferences.theme = preferencesIn.theme;
    }

    loggedInUser.preferences = preferences;
    this.loggedInUser.next(loggedInUser);

    localUsers[userKey] = loggedInUser;
    localStorage['recentLogins'] = JSON.stringify(localUsers);
  }
}
