import { Routes } from '@angular/router';
import { HomeComponent } from './features/home/home.component';
import { RoomComponent } from './features/room/room.component';

export const routes: Routes = [
    { path: '', component: HomeComponent },
    { path: 'room/:roomCode', component: RoomComponent }
];
