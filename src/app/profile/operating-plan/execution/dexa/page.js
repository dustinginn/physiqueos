import { FounderRepositories } from "../../../../../data/repositories/founderRepositories";
import { DEXA_APPOINTMENT_ID } from "../../../../../domain/services/DexaAppointmentManagementService";
import { DexaAppointmentDetailScreen,DexaAppointmentEditorScreen } from "../../../../../screens/DexaAppointmentScreen";
import { saveDexaAppointment } from "./actions";
export const dynamic="force-dynamic";
export default async function Page({searchParams}){const query=await searchParams;const user=await FounderRepositories.users.getCurrentUser();const item=await FounderRepositories.executionItems.getExecutionItemById(DEXA_APPOINTMENT_ID);const timezone=user.timezone??"America/Los_Angeles";const today=new Intl.DateTimeFormat("en-CA",{timeZone:timezone,year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());const minDate=new Date(`${today}T12:00:00`);minDate.setDate(minDate.getDate()+1);const future=minDate.toISOString().slice(0,10);if(query?.edit==="1")return <DexaAppointmentEditorScreen action={saveDexaAppointment.bind(null,{expectedRevision:item?.executionRevision??null})} item={item} minDate={future}/>;return <DexaAppointmentDetailScreen item={item}/>;}
