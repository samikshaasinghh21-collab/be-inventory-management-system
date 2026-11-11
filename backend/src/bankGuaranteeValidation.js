import { z } from 'zod';
import { bankIdentity, calculatedBgAmount, guaranteeTypes } from '../../shared/bankGuarantees.js';

const text = max => z.string().trim().max(max);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a valid date').refine(v => !Number.isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0,10) === v, 'Invalid calendar date');
const optionalMoney = z.preprocess(v => v === '' || v == null ? null : v, z.coerce.number().positive().max(999999999999).nullable());
const bank = z.object({
  name: text(200).min(1, 'Bank name is required'), branch: text(200),
  accountNumber: text(80), ifsc: text(11).refine(v => !v || /^[A-Z]{4}0[A-Z0-9]{6}$/.test(v), 'Invalid IFSC code'),
  contactNumber: text(40), email: text(254).refine(v => !v || z.string().email().safeParse(v).success, 'Invalid bank email'),
});
export const guaranteeSchema = z.object({
  projectId: z.coerce.number().int().positive(), guaranteeNumber: text(120).min(1),
  type: z.enum(guaranteeTypes), contractNumber: text(200), contractValue: optionalMoney,
  securityPercentage: z.preprocess(v => v === '' || v == null ? null : v, z.coerce.number().positive().max(100).nullable()),
  amountMode: z.enum(['direct', 'calculated']), amount: z.coerce.number().positive().max(999999999999),
  issuingBank: bank, claimantBank: bank, issueDate: date, expiryDate: date, claimDeadline: date,
  remarks: text(4000),
}).superRefine((v, ctx) => {
  if(v.expiryDate < v.issueDate) ctx.addIssue({code:'custom',message:'Expiry cannot precede issue date',path:['expiryDate']});
  if(v.claimDeadline < v.issueDate) ctx.addIssue({code:'custom',message:'Claim deadline cannot precede issue date',path:['claimDeadline']});
  if(v.amountMode === 'calculated' && (!v.contractValue || !v.securityPercentage)) ctx.addIssue({code:'custom',message:'Contract value and percentage are required for calculated amount',path:['amount']});
}).transform(v => ({...v, amount: v.amountMode === 'calculated' ? calculatedBgAmount(v.contractValue,v.securityPercentage) : Math.round(v.amount*100)/100})).refine(v => v.amount > 0, 'BG amount must be positive');
export const closureSchema = z.object({closureDate:date,reason:text(2000).min(1),revision:z.coerce.number().int().positive()});
export const changeSchema = z.object({revision:z.coerce.number().int().positive(),reason:text(2000).min(1, 'Change reason is required')});
export { bankIdentity };
