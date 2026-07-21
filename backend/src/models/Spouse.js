import { DataTypes, Model } from 'sequelize';

export class Spouse extends Model {}

export function initSpouse(sequelize) {
  Spouse.init(
    {
      id: {
        type: DataTypes.INTEGER.UNSIGNED,
        autoIncrement: true,
        primaryKey: true
      }
      // memberAId / memberBId are added by the belongsTo association
      // definitions in models/index.js — not redeclared here.
    },
    {
      sequelize,
      modelName: 'Spouse',
      tableName: 'spouses',
      indexes: [{ unique: true, fields: ['memberAId', 'memberBId'] }],
      hooks: {
        beforeValidate(spouse) {
          if (
            spouse.memberAId != null &&
            spouse.memberBId != null &&
            spouse.memberAId > spouse.memberBId
          ) {
            const tmp = spouse.memberAId;
            spouse.memberAId = spouse.memberBId;
            spouse.memberBId = tmp;
          }
        }
      },
      validate: {
        notSelfMarriage() {
          if (this.memberAId != null && this.memberBId != null && this.memberAId === this.memberBId) {
            throw new Error('A member cannot be their own spouse.');
          }
        }
      }
    }
  );

  return Spouse;
}
