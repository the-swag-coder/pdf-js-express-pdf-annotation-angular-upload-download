import {AfterViewInit, Component, ElementRef, OnInit, ViewChild} from '@angular/core';
import WebViewer from '@pdftron/pdfjs-express';

import {CommunicationService} from "./service/communication/communication.service";

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})
export class AppComponent implements OnInit, AfterViewInit {

  @ViewChild('viewer') viewer: ElementRef;

  private webViewerInstance: any;
  public documentDetails: any;

  private roomId = 1;

  public filePath: any;

  constructor(
    private communicationService: CommunicationService
  ) {
  }

  ngOnInit(): void {
    this.communicationService.getUpdatedPDF()
      .subscribe((data) => {
        this.updateDocument(data).then();
      });
  }

  ngAfterViewInit(): void {
    this.joinRoom();
  }

  loadDocumentInViewer(): void {
    WebViewer({
      path: 'lib'
    }, this.viewer.nativeElement).then((instance) => {
      this.webViewerInstance = instance;

      if (this.documentDetails) {
        instance.docViewer.on('documentLoaded', () => {
          instance.annotManager.importAnnotations(this.documentDetails.xfdf).then();
        });
      }

      const {annotManager} = instance;
      annotManager.on('annotationChanged', (annotations, action, {imported}) => {
        if (imported) {
          return;
        }

        annotations.forEach((annotation) => {
          // add annotated file fun
          this.getAnnotatedFile({
            action: action,
            annotationId: annotation.Id
          }).then();
        })
      });
    })
  }

  joinRoom(): void {
    this.communicationService.joinRoom({roomId: this.roomId});
  }

  async getAnnotatedFile(data) {
    const {annotManager} = this.webViewerInstance;

    if (data.action === 'delete') {
      const command = '<delete><id>' + data.annotationId + '</id></delete>';
      annotManager.importAnnotCommand(command).then();
    }

    const xfdf: string = await annotManager.exportAnnotations({links: false, widgets: false});
    // save annotation fun
    this.saveAnnotation({...data, xfdf})
  }

  saveAnnotation(data): void {
    this.documentDetails = {
      xfdf: data.xfdf,
      annotationId: data.action === 'delete' ? data.annotationId : null,
      roomId: this.roomId
    };

    this.communicationService.updatePDF(this.documentDetails);
  }

  async updateDocument(data) {
    const {annotManager} = this.webViewerInstance;

    if (data.annotationId) {
      const command = '<delete><id>' + data.annotationId + '</id></delete>';
      annotManager.importAnnotCommand(command).then();
    } else {
      annotManager.importAnnotations(data.xfdf).then();
    }
  }

  uploadFile(event: Event): void {
    if (event.target['files'].length) {
      const reader = new FileReader();
      reader.readAsDataURL(event.target['files'][0]);
      reader.onloadend = () => {
        this.filePath = reader.result;
        setTimeout(() => {
          this.loadDocumentInViewer();
          setTimeout(() => {
            this.webViewerInstance.loadDocument(this.filePath);
          }, 1000);
        }, 500)
      }
    }
  }

  async onSave() {
    const {docViewer, annotManager} = this.webViewerInstance;

    const xfdf = await annotManager.exportAnnotations({links: false, widgets: false});
    const fileData = await docViewer.getDocument().getFileData({});
    const blob = new Blob([fileData], {type: 'application/pdf'});

    const data = new FormData();
    data.append('xfdf', xfdf);
    data.append('file', blob);
    // data.append('license', my_license_key);

    // Process the file
    const response = await fetch('https://api.pdfjs.express/xfdf/set', {
      method: 'post',
      body: data
    }).then(resp => resp.json());

    const { url, key, id } = response;

    // Download the file
    const mergedFileBlob = await fetch(url, {
      headers: {
        Authorization: key
      }
    }).then(resp => resp.blob());

    const link = document.createElement('a');
    // create a blobURI pointing to our Blob
    link.href = URL.createObjectURL(mergedFileBlob);
    link.download = 'annotatedPDF.pdf';
    link.click();
  }

  downloadPdf(): void {
    this.onSave().then();
  }

}
