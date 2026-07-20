import { DataTypes, Model } from 'sequelize';
import bcrypt from 'bcryptjs';

export class User extends Model {
  async validatePassword(password) {
    return bcrypt.compare(password, this.passwordHash);
  }
}

export function initUser(sequelize) {
  User.init(
    {
      id: {
        type: DataTypes.INTEGER.UNSIGNED,
        autoIncrement: true,
        primaryKey: true
      },
      name: {
        type: DataTypes.STRING,
        allowNull: false
      },
      email: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
        validate: { isEmail: true }
      },
      passwordHash: {
        type: DataTypes.STRING,
        allowNull: false
      },
      role: {
        type: DataTypes.ENUM('ADMIN', 'USER'),
        allowNull: false,
        defaultValue: 'USER'
      },
      resetPasswordToken: {
        type: DataTypes.STRING,
        allowNull: true
      },
      resetPasswordExpiresAt: {
        type: DataTypes.DATE,
        allowNull: true
      },
      passwordChangedAt: {
        type: DataTypes.DATE(3),
        allowNull: true,
        defaultValue: null
      }
    },
    {
      sequelize,
      modelName: 'User',
      tableName: 'users',
      hooks: {
        beforeValidate(user) {
          if (user.email) user.email = user.email.toLowerCase().trim();
        },
        async beforeCreate(user) {
          if (user.passwordHash) user.passwordHash = await bcrypt.hash(user.passwordHash, 12);
        },
        async beforeUpdate(user) {
          if (user.changed('passwordHash')) {
            user.passwordHash = await bcrypt.hash(user.passwordHash, 12);
            user.passwordChangedAt = new Date();
          }
        }
      }
    }
  );

  return User;
}
