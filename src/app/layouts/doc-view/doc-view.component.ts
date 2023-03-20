import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';

import {
    Pipe,
    PipeTransform
} from '@angular/core';

import { Location } from '@angular/common';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { KeycloakService } from 'keycloak-angular';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { AuthService } from 'src/app/services/auth/auth.service';
import { GeneralService } from 'src/app/services/general/general.service';
import { IImpressionEventInput, IInteractEventInput } from 'src/app/services/telemetry/telemetry-interface';
import { TelemetryService } from 'src/app/services/telemetry/telemetry.service';

@Component({
    selector: 'app-doc-view',
    templateUrl: './doc-view.component.html',
    styleUrls: ['./doc-view.component.scss']
})
export class DocViewComponent implements OnInit {
    docUrl: string;
    extension;
    document = [];
    loader: boolean = true;
    docName: any;
    docDetails: any;
    credential: any;
    schemaId: string;
    templateId: string;
    private readonly canGoBack: boolean;
    constructor(
        public generalService: GeneralService,
        private router: Router,
        private http: HttpClient,
        private location: Location,
        private authService: AuthService,
        private activatedRoute: ActivatedRoute,
        private telemetryService: TelemetryService
    ) {
        const navigation = this.router.getCurrentNavigation();
        this.credential = navigation.extras.state;
        this.canGoBack = !!(this.router.getCurrentNavigation()?.previousNavigation);

        if (!this.credential) {
            if (this.canGoBack) {
                this.location.back();
            } else {
                this.router.navigate(['/home']);
            }
        }
    }

    ngOnInit(): void {
        if (this.credential?.credential_schema) {
            // this.schemaId = JSON.parse(this.credential.credential_schema)?.id;
            this.schemaId = this.credential.schemaId;
            this.getTemplate(this.schemaId).subscribe((res) => {//clf16wnze0002tj14mv1smo1w
                this.templateId = res?.result?.[0]?.id;
                this.getPDF(res?.result?.[0]?.template);
            });
        } else {
            console.error("Something went wrong!");
        }
    }

    getSchema(id): Observable<any> {
        return this.generalService.getData(`https://ulp.uniteframework.io/cred-schema/schema/jsonld?id=${id}`, true);
    }

    getTemplate(id: string): Observable<any> {
        return this.generalService.getData(`https://ulp.uniteframework.io/ulp-bff/v1/sso/student/credentials/rendertemplateschema/${id}`, true)
    }

    getPDF(template) {
        let headerOptions = new HttpHeaders({
            'Accept': 'application/pdf'
        });
        let requestOptions = { headers: headerOptions, responseType: 'blob' as 'json' };
        const credential_schema = this.credential.credential_schema;
        delete this.credential.credential_schema;
        delete this.credential.schemaId;
        const request = {
            credential: { ...this.credential, subject: JSON.stringify(this.credential.credentialSubject) },
            schema: credential_schema,
            template: template,
            output: "HTML"
        }
        delete request.credential.credentialSubject;
        this.http.post('https://ulp.uniteframework.io/ulp-bff/v1/sso/student/credentials/render', request, requestOptions).pipe(map((data: any) => {

            let blob = new Blob([data], {
                type: 'application/pdf' // must match the Accept type
            });

            this.docUrl = window.URL.createObjectURL(blob);
            // this.pdfResponse2 = this.sanitizer.bypassSecurityTrustResourceUrl(this.pdfResponse);
            // console.log(this.pdfResponse2);
            // this.pdfResponse = this.readBlob(blob);
            // console.log(this.pdfResponse);

        })).subscribe((result: any) => {
            this.loader = false;
            this.extension = 'pdf';
        });
    }

    goBack() {
        window.history.go(-1);
    }

    downloadCertificate(url) {
        let link = document.createElement("a");
        link.href = url;
        link.download = 'certificate.pdf';
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        this.raiseInteractEvent('download-certificate');
    }

    raiseImpressionEvent() {
        const telemetryImpression: IImpressionEventInput = {
            context: {
                env: this.activatedRoute.snapshot?.data?.telemetry?.env,
                cdata: [{
                    id: this.schemaId,
                    type: 'schema'
                }]
            },
            object: {
                id: this.templateId,
                type: 'template'
            },
            edata: {
                type: this.activatedRoute.snapshot?.data?.telemetry?.type,
                pageid: this.activatedRoute.snapshot?.data?.telemetry?.pageid,
                uri: this.router.url,
                subtype: this.activatedRoute.snapshot?.data?.telemetry?.subtype,
            }
        };
        this.telemetryService.impression(telemetryImpression);
    }

    raiseInteractEvent(id: string, type: string = 'CLICK', subtype?: string) {
        const telemetryInteract: IInteractEventInput = {
            context: {
                env: this.activatedRoute.snapshot?.data?.telemetry?.env,
                cdata: [{
                    id: this.schemaId,
                    type: 'schema'
                }]
            },
            object: {
                id: this.templateId,
                type: 'template'
            },
            edata: {
                id,
                type,
                subtype,
                pageid: this.activatedRoute.snapshot?.data?.telemetry?.pageid,
            }
        };
        this.telemetryService.interact(telemetryInteract);
    }
}


// Using similarity from AsyncPipe to avoid having to pipe |secure|async in HTML.

@Pipe({
    name: 'authImage'
})
export class AuthImagePipe implements PipeTransform {
    extension;
    constructor(
        private http: HttpClient, private route: ActivatedRoute,
        private keycloakService: KeycloakService, // our service that provides us with the authorization token
    ) {

        // this.route.queryParams.subscribe(async params => {
        //     this.extension = params.u.split('.').slice(-1)[0];
        // })
    }

    async transform(src: string, extension: string): Promise<any> {
        this.extension = extension;
        const token = this.keycloakService.getToken();
        const headers = new HttpHeaders({ 'Authorization': `Bearer ${token}` });
        let imageBlob = await this.http.get(src, { headers, responseType: 'blob' }).toPromise();

        if (this.extension == 'pdf') {
            imageBlob = new Blob([imageBlob], { type: 'application/' + this.extension })
        } else {
            imageBlob = new Blob([imageBlob], { type: 'image/' + this.extension })
        }

        const reader = new FileReader();
        return new Promise((resolve, reject) => {
            reader.onloadend = () => resolve(reader.result as string);
            reader.readAsDataURL(imageBlob);
        });
    }

}


