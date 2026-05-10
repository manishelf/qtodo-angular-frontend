import { Component, OnInit, QueryList, ViewChild, ViewChildren } from '@angular/core';
import { User } from '../../../models/User';
import { UserService } from '../../../service/user/user.service';
import { MatIcon } from '@angular/material/icon';
import { FormBuilder, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { BeanItemComponent } from '../../../component/bean-item/bean-item.component';
import { ManageUserPermissionsComponent } from '../../../component/manage-user-permissions/manage-user-permissions.component';
import { ConnectionService } from '../../../service/connection/connection.service';
import { ToastService } from 'angular-toastify';
import { localUser } from '../../../service/consts';

@Component({
  selector: 'app-profile',
  imports: [ManageUserPermissionsComponent, MatIcon,CommonModule, ReactiveFormsModule, BeanItemComponent],
  templateUrl: './profile.component.html',
  styleUrl: './profile.component.css'
})
export class ProfileComponent implements OnInit{

  user!: User;
  userPermissions: string[] = [];
  profilePicDataUrl: string = '';
  form: FormGroup;

  isUgColab: boolean = false;
  isUgOpen: boolean = false;

  isOffLine: boolean = false;

  hideChildItems: boolean = false;

  userGroupList:string[] = [];
  recentLogins: any = {};

  @ViewChildren(ManageUserPermissionsComponent) userPermissionComp!: QueryList<ManageUserPermissionsComponent>;

  CAN_MANAGE_PARTICIPANT_PERMISSIONS: boolean = false;
  CAN_ENABLE_DISABLE_UG: boolean = false;
  CAN_ADD_PARTICIPANT: boolean = false;
  CAN_REMOVE_PARTICIPANT: boolean = false;
  CAN_CHANGE_UG_CONFIG: boolean = false;

  constructor(private userService: UserService, private connectionService: ConnectionService, private toaster: ToastService){
    
    let formBuilder = new FormBuilder();

    const formControls: { [key: string]: FormControl } = {};
    formControls['alias'] = formBuilder.control('', Validators.required);

    let passwordRegex = "^(?=.*[A-Za-z])(?=.*\\d)(?=.*[@$!%*#?&])[A-Za-z\\d@$!%*#?&]{5,}$";
    formControls['newPassword'] = formBuilder.control('', Validators.pattern(passwordRegex));
    formControls['ugDescription'] = formBuilder.control('');
    formControls['ugOpen'] = formBuilder.control(false);
    formControls['ugColab'] = formBuilder.control(false);
    formControls['userGroup'] = formBuilder.control(localUser.userGroup);
    this.form = formBuilder.group(formControls);
    
    userService.loggedInUser$.subscribe((user)=>{
      this.user = user;
      
      if(user.profilePicture){
        if(user.profilePicture.startsWith('/item/doc/')){
          this.connectionService.getUrlWithToken(user.profilePicture).then(url=>this.profilePicDataUrl=url);
        }else{
          this.profilePicDataUrl = user.profilePicture;
        }
      }else{
        this.profilePicDataUrl = '';
      }

      if(user.preferences?.hideChildItems){
        this.hideChildItems = true;
      }

      this.userGroupList = [];
      this.recentLogins = this.userService.getRecentLogins();

      for(let key of Object.keys(this.recentLogins)){
        let userKey = key.split('/');
        if(userKey[1] == user.email){          
          this.userGroupList.push(userKey[0]);
        }
      }
      
      this.CAN_MANAGE_PARTICIPANT_PERMISSIONS = false;
      this.CAN_ADD_PARTICIPANT = false;
      this.CAN_CHANGE_UG_CONFIG = false;
      this.CAN_REMOVE_PARTICIPANT = false;
      this.CAN_ENABLE_DISABLE_UG = false;

      this.isOffLine = user.email == localUser.email;

      let payload = this.userService.getPayloadFromAccessToken();
      if(!payload) return;

      this.userPermissions = payload.permissions.sort();
      this.isUgOpen = payload['user_group_open'];
      this.isUgColab = payload['user_group_colaboration'];

      this.form.setValue({alias: user.alias, 
        newPassword: '', ugDescription: '',
        ugOpen: this.isUgOpen, ugColab: this.isUgColab, 
        userGroup: user.userGroup});

      if(this.userPermissions.includes('MANAGE_PARTICIPANT_PERMISSIONS'))
        this.CAN_MANAGE_PARTICIPANT_PERMISSIONS = true;
      if(this.userPermissions.includes('ENABLE_DISABLE_UG'))
        this.CAN_ENABLE_DISABLE_UG = true;
      if(this.userPermissions.includes('ADD_PARTICIPANT'))
        this.CAN_ADD_PARTICIPANT = true;
      if(this.userPermissions.includes('REMOVE_PARTICIPANT'))
        this.CAN_REMOVE_PARTICIPANT = true;
      if(this.userPermissions.includes('CHANGE_UG_CONFIG'))
        this.CAN_CHANGE_UG_CONFIG = true;
    });
  }

  ngOnInit():void{
    this.form.patchValue({
      userGroup: this.user.userGroup
    }); // bug where the userGroup is not selected
  }

  savePic(event:Event, type: string){
    let ele = event.target as any;
    let file = ele.files[0];
    if(file){
      let reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (e)=>{
        let url = e.target?.result;
        let dataUrl = url?.toString() || '';
        if(type == 'profile'){
          this.profilePicDataUrl = dataUrl;
        }
      }
    }
  }

  updateUserDetails(){    
    this.connectionService.axios.post('/user/update/usergroup/details',{
      open: this.form.value.ugOpen,
      colaboration: this.form.value.ugColab
    });
    this.userPermissionComp.first.postChangeRequest();
  }

  addUserGroupOnPrompt(event: Event){
    let userGroup = (prompt('Enter your group title') || '');
    if(userGroup != ''){
      if(userGroup.includes(' ')){
        this.toaster.error("group name cannot contain spaces!");
        this.toaster.info("please replace spaces with _ in the group name");
        return;
      }
      this.addUserGroup(userGroup);
      
      let target = event.target as HTMLInputElement;
      target.value = userGroup;
      this.onUgSelChange(event);
    }
  }

  addUserGroup(userGroup: string){
      this.userGroupList = [...this.userGroupList, userGroup];
      let val = this.form.value;
      val['userGroup']= userGroup;
      this.form.setValue(val);      
  }

  onUgSelChange(event: Event){    
    let target = event.target as HTMLInputElement;
    let selKey = target.value+'/'+this.user.email;
    
    let user = this.recentLogins[selKey];
    if(!user){
      user = structuredClone(this.user);
      user.token = null;
      user.userGroup = target.value;
      this.recentLogins[user.userGroup+'/'+user.email]=user;
      localStorage["recentLogins"] = JSON.stringify(this.recentLogins);       
    }    
    this.userService.loggedInUser.next(user);
  }

  onClickToggleHideChildItems(event: Event){
    this.userService.updateUserPreferences({hideChildItems: !this.hideChildItems});
  }

  clearCache(){
    if(prompt('clearing cache can cause data loss if you forget your logins details! Enter Y to procede') == 'Y'){
      localStorage.clear();
      this.toaster.info("cache cleared!");
    }
  }
}
