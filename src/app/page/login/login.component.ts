import { Component, ElementRef, HostListener, ViewChild } from '@angular/core';
import { UserService } from './../../service/user/user.service';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { FormBuilder, FormControl, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { ConnectionService } from '../../service/connection/connection.service';
import { User } from '../../models/User';
import { ToastService } from 'angular-toastify';
import { localUser } from '../../service/consts';

@Component({
  selector: 'app-login',
  imports: [CommonModule, RouterLink, MatIconModule, FormsModule, ReactiveFormsModule],
  templateUrl: './login.component.html',
  styleUrl: './login.component.css'
})
export class LoginComponent {

  asLogin:boolean = true;

  @ViewChild('emailInp') emailInpEle!: ElementRef;
  @ViewChild('profilePicEle') profilePicEle!: ElementRef;

  userGroupList: Set<string> = new Set(['qtodo']);

  profilePicDataUrl: string | null = null;

  formGroup: FormGroup;

  firstName: string = "";

  lastName: string = "";

  rememberMe: boolean = true;


  constructor(private userService: UserService,
     private activatedRoute: ActivatedRoute, 
     private router: Router,
     private connectionService: ConnectionService,
     private formBuilder: FormBuilder,
     private toaster: ToastService
    ){
    activatedRoute.url.subscribe(url=>{
      if(url[0].path === 'login'){
        this.asLogin = true;
      }else{
        this.asLogin = false;
      }
    });
    setTimeout(()=>{
      this.emailInpEle.nativeElement.focus();
    },200);
    connectionService.axios.get('/user/usergroups').then((resp)=>{
      resp.data?.body.forEach((ug:string)=>{
        this.userGroupList.add(ug);
      })
    });
    const formControls: { [key: string]: FormControl} = {
      "email":this.formBuilder.control(
        "",Validators.email
      ),
      "password": this.formBuilder.control(
        "",Validators.pattern("^(?=.*[A-Za-z])(?=.*\\d)(?=.*[@$!%*#?&])[A-Za-z\\d@$!%*#?&]{5,}$")
      ),
      "userGroup": this.formBuilder.control(
        "qtodo"
      ),
    };
    if(!this.asLogin){
      formControls['alias']=formBuilder.control('',Validators.required);
    }
    this.formGroup = this.formBuilder.group(formControls);

    this.connectionService.connectToBackend().catch((e)=>{
      this.router.navigate(['/home']);
    });
  }

  async onSubmitClick(){
      if(!this.formGroup.valid){
        let errors = new Map();
        let control = this.formGroup?.get('email');
        errors.set('email', control?.errors);
        control = this.formGroup.get('password');
        errors.set('password', control?.errors);
        control = this.formGroup.get('rememberMe');
        errors.set('rememberMe', control?.errors);
        if(!this.asLogin){
          control = this.formGroup.get('alias');
          errors.set('alias',control?.errors);
        }
        errors.forEach((val,key)=>{
          if(val)
          this.toaster.error(key+'->'+JSON.stringify(val));
        })
        return;
      }
    let data = this.formGroup.value;
    let user: User = {
      alias: data['alias'],
      email: data['email'],
      password: data['password'],
      userGroup: data['userGroup'],
      profilePicture: ''
    }


    if(this.profilePicDataUrl){
      user.profilePicture = this.profilePicDataUrl;
    }

    user.email = (user.email as string).toLowerCase();

    let action = this.asLogin ? '/login':'/signup';

    this.connectionService.axios.post('/user'+action,
      user
    ).then((resp)=>{
      
      if(resp.status != 200) return;

      user.token = resp.data?.accessToken;
      user.profilePicture = this.profilePicDataUrl || '';
      if(this.asLogin){
        user.token = resp.data?.userDetails.accessToken;
        user.alias = resp.data?.userDetails.alias;
        if(resp.data?.userDetails.profilePicture){
          let refUrl = resp.data?.userDetails.profilePicture;
          user.profilePicture = refUrl;
        }
      }
      user.password = "";
      let recentLogins = localStorage['recentLogins'];
      if(!recentLogins || recentLogins == 'null'){
        recentLogins = `{"${localUser.userGroup}/${localUser.email}":${JSON.stringify(localUser)}}`;
      }
        
      recentLogins = JSON.parse(recentLogins);
      if(this.rememberMe){
        if(user.email && user.userGroup){
          recentLogins[user.userGroup+'/'+user.email]=user;
        } 
      }else{
        recentLogins['anon/anon']={email:'anon', userGroup:'anon'}
      }
      localStorage['recentLogins'] = JSON.stringify(recentLogins);       

      this.userService.loggedInUser.next(user);
      this.router.navigate(['/home']);
    }).catch((e)=>{
      console.error(e);
    });
  }

  addUserGroup(){
    let userGroup = (prompt('Enter your group title') || '');
    if(userGroup != ''){
      if(userGroup.includes(' ')){
        this.toaster.error("group name cannot contain spaces!");
        this.toaster.info("please replace spaces with _ in the group name");
        return;
      }
      this.userGroupList.add(userGroup);
      let val = this.formGroup.value;
      val['userGroup']= userGroup;
      this.formGroup.setValue(val);
    }
  }

  handleEnter(event: KeyboardEvent){
    if(event.key == 'Enter'){
      event.preventDefault();
      this.onSubmitClick();
    }
  }

  selectImageFile(){
    this.profilePicEle.nativeElement.click();
  }

  saveProfilePic(event: Event){
    let ele = event.target as any;
    let file = ele.files[0];
    if(file){
      let reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (e)=>{
        let url = e.target?.result;
        this.profilePicDataUrl = url?.toString() || null;
      }
    }
  }
}
