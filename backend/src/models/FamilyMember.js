import { DataTypes, Model } from 'sequelize';

export class FamilyMember extends Model {}

export function initFamilyMember(sequelize) {
  FamilyMember.init(
    {
      id: {
        type: DataTypes.INTEGER.UNSIGNED,
        autoIncrement: true,
        primaryKey: true
      },
      firstname: {
        type: DataTypes.STRING,
        allowNull: false
      },
      lastname: {
        type: DataTypes.STRING,
        allowNull: false
      },
      gender: {
        type: DataTypes.ENUM('Male', 'Female', 'Other'),
        allowNull: false,
        validate: { isIn: [['Male', 'Female', 'Other']] }
      },
      mothersname: {
        type: DataTypes.STRING,
        allowNull: true
      },
      email: {
        type: DataTypes.STRING,
        allowNull: true,
        validate: { isEmail: true }
      },
      birthdate: {
        type: DataTypes.DATEONLY,
        allowNull: true
      },
      // Legacy column, kept for historical data but no longer written or read
      // by the app — superseded by `isAlive` (a member is deceased when the
      // admin toggles this off; the exact date is no longer captured).
      deathdate: {
        type: DataTypes.DATEONLY,
        allowNull: true
      },
      isAlive: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true
      },
      phone: {
        type: DataTypes.STRING,
        allowNull: true
      },
      address: {
        type: DataTypes.STRING,
        allowNull: true
      },
      profilePicture: {
        type: DataTypes.STRING,
        allowNull: true
      },
      geezFirstname: {
        type: DataTypes.STRING,
        allowNull: true
      },
      geezLastname: {
        type: DataTypes.STRING,
        allowNull: true
      },
      geezMothersname: {
        type: DataTypes.STRING,
        allowNull: true
      },
      geezFullname: {
        type: DataTypes.VIRTUAL,
        get() {
          return [this.geezFirstname, this.geezLastname].filter(Boolean).join(' ') || null;
        }
      },
      fullname: {
        type: DataTypes.VIRTUAL,
        get() {
          return `${this.firstname} ${this.lastname}`;
        }
      }
    },
    {
      sequelize,
      modelName: 'FamilyMember',
      tableName: 'family_members',
      validate: {
        deathAfterBirth() {
          if (this.birthdate && this.deathdate && this.deathdate < this.birthdate) {
            throw new Error('deathdate must not be before birthdate.');
          }
        },
        noFutureDates() {
          const today = new Date().toISOString().slice(0, 10);
          if (this.birthdate && this.birthdate > today) {
            throw new Error('birthdate must not be in the future.');
          }
          if (this.deathdate && this.deathdate > today) {
            throw new Error('deathdate must not be in the future.');
          }
        }
      }
    }
  );

  return FamilyMember;
}
