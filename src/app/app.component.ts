import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, CommonModule],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent {
  title = 'Project_YourCloud_UI';
  
  constructor(private http: HttpClient) {}
  
  // Test storage node status
  async testStorageNode() {
    try {
      // Replace with your actual backend API URL
      const response = await this.http.get('http://localhost:3000/api/storage-nodes').toPromise();
      console.log('Storage nodes:', response);
    } catch (error) {
      console.error('Error connecting to backend:', error);
    }
  }
  
  // Test file upload
  async testFileUpload(event: any) {
    const file = event.target.files[0];
    if (file) {
      const formData = new FormData();
      formData.append('file', file);
      
      try {
        const response = await this.http.post('http://localhost:3000/api/upload', formData).toPromise();
        console.log('File uploaded:', response);
      } catch (error) {
        console.error('Upload error:', error);
      }
    }
  }
}
